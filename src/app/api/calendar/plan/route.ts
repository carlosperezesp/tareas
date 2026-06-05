import { getSession } from "@/lib/auth";
import { planCalendarEvents } from "@/lib/calendar";
import { ensureSchema } from "@/lib/db";

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSchema();
    const created = await planCalendarEvents(session.email);
    return Response.json({ created });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Calendar planning failed" },
      { status: 500 }
    );
  }
}
