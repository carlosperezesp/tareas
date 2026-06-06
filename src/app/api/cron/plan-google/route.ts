import { planCalendarEvents } from "@/lib/calendar";
import { ensureSchema, getSql } from "@/lib/db";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();
  const users = await sql`
    SELECT user_email
    FROM google_tokens
    WHERE refresh_token IS NOT NULL
    ORDER BY updated_at ASC
  `;

  const results = [];
  for (const user of rows(users)) {
    const email = String(user.user_email);
    try {
      const created = await planCalendarEvents(email);
      results.push({ email, created: created.length });
    } catch (error) {
      results.push({
        email,
        error: error instanceof Error ? error.message : "Calendar planning failed",
      });
    }
  }

  return Response.json({ ok: true, results });
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
