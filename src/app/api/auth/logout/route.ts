import { clearSession, getAppUrl } from "@/lib/auth";

export async function GET() {
  await clearSession();
  return Response.redirect(getAppUrl());
}
