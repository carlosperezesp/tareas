import { getAppUrl, setSession } from "@/lib/auth";
import { ensureSchema, getSql } from "@/lib/db";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type GoogleUserInfo = {
  email: string;
  name: string;
  picture?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!code || !state || state !== expectedState) {
    return Response.json({ error: "Invalid Google OAuth callback" }, { status: 400 });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: "Google OAuth env vars are not configured" }, { status: 500 });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${getAppUrl()}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return Response.json({ error: "Could not exchange Google OAuth code" }, { status: 500 });
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userResponse.ok) {
    return Response.json({ error: "Could not read Google profile" }, { status: 500 });
  }

  const user = (await userResponse.json()) as GoogleUserInfo;
  await ensureSchema();
  const sql = getSql();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await sql`
    INSERT INTO google_tokens (
      user_email, name, picture, access_token, refresh_token, expires_at, updated_at
    )
    VALUES (
      ${user.email}, ${user.name}, ${user.picture ?? null}, ${tokens.access_token},
      ${tokens.refresh_token ?? null}, ${expiresAt}, NOW()
    )
    ON CONFLICT (user_email) DO UPDATE SET
      name = EXCLUDED.name,
      picture = EXCLUDED.picture,
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `;

  await seedDefaultCategories(user.email);
  await setSession({ email: user.email, name: user.name, picture: user.picture });

  return Response.redirect(getAppUrl());
}

async function seedDefaultCategories(email: string) {
  const sql = getSql();
  for (const name of ["Fruta", "Nevera", "Despensa"]) {
    await sql`
      INSERT INTO categories (id, user_email, name)
      VALUES (${crypto.randomUUID()}, ${email}, ${name})
      ON CONFLICT (user_email, name) DO NOTHING
    `;
  }
}
