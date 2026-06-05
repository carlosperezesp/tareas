import { getSql } from "./db";

type TokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  urgency: string;
  created_at: string;
};

type BusyBlock = {
  start: string;
  end: string;
};

type Slot = {
  start: Date;
  end: Date;
};

const TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Amsterdam";

export async function planCalendarEvents(email: string) {
  const selectedTasks = await selectCalendarTasks(email);
  if (!selectedTasks.length) return [];

  const accessToken = await getValidAccessToken(email);
  const slots = await findAvailableSlots(accessToken, selectedTasks.length);
  const created = [];

  for (const task of selectedTasks) {
    const slot = slots.shift();
    if (!slot) break;
    const event = await createCalendarEvent(accessToken, task, slot);
    await markTaskEventCreated(email, task.id, event.id);
    created.push({
      taskId: task.id,
      title: task.title,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      googleEventId: event.id,
      htmlLink: event.htmlLink,
    });
  }

  return created;
}

async function selectCalendarTasks(email: string): Promise<TaskRow[]> {
  const sql = getSql();
  const result = await sql`
    SELECT id, title, urgency, created_at
    FROM tasks
    WHERE user_email = ${email}
      AND status IN ('Sin empezar', 'En proceso')
      AND urgency IS NOT NULL
      AND urgency <> ''
      AND event_created = FALSE
      AND google_event_id IS NULL
    ORDER BY created_at ASC
  `;

  const tasks = rows(result).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    urgency: String(row.urgency),
    created_at: String(row.created_at),
  }));

  const urgent = tasks.filter((task) => task.urgency === "Alta").slice(0, 2);
  const medium = tasks.filter((task) => task.urgency === "Media").slice(0, 1);
  const selectedIds = new Set([...urgent, ...medium].map((task) => task.id));
  const fallback = tasks.filter((task) => !selectedIds.has(task.id)).slice(0, 3 - selectedIds.size);

  return [...urgent, ...medium, ...fallback].slice(0, 3);
}

async function getValidAccessToken(email: string) {
  const sql = getSql();
  const result = await sql`
    SELECT access_token, refresh_token, expires_at
    FROM google_tokens
    WHERE user_email = ${email}
    LIMIT 1
  `;
  const token = rows(result)[0] as TokenRow | undefined;
  if (!token) throw new Error("No Google token found");

  const expiresAt = new Date(token.expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("Google refresh token missing. Sign out and sign in again.");
  }

  const refreshed = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshed.ok) {
    throw new Error("Could not refresh Google access token");
  }

  const data = (await refreshed.json()) as { access_token: string; expires_in: number };
  const expires = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await sql`
    UPDATE google_tokens
    SET access_token = ${data.access_token}, expires_at = ${expires}, updated_at = NOW()
    WHERE user_email = ${email}
  `;

  return data.access_token;
}

async function findAvailableSlots(accessToken: string, count: number) {
  const candidates = buildCandidateSlots(14);
  const timeMin = candidates[0].start.toISOString();
  const timeMax = candidates[candidates.length - 1].end.toISOString();
  const busy = await getBusyBlocks(accessToken, timeMin, timeMax);
  const available = candidates.filter((slot) => !busy.some((block) => overlaps(slot, block)));
  return available.slice(0, count);
}

function buildCandidateSlots(daysAhead: number) {
  const slots: Slot[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    const weekend = [0, 6].includes(day.getDay());
    const startHour = weekend ? 10 : 18;
    const endHour = 22;

    for (let hour = startHour; hour < endHour; hour += 1) {
      for (const minute of [0, 30]) {
        const start = new Date(day);
        start.setHours(hour, minute, 0, 0);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        if (start.getTime() > now.getTime() + 5 * 60 * 1000) {
          slots.push({ start, end });
        }
      }
    }
  }

  return slots;
}

async function getBusyBlocks(accessToken: string, timeMin: string, timeMax: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: TIME_ZONE,
      items: [{ id: "primary" }],
    }),
  });

  if (!response.ok) {
    throw new Error("Could not query Google Calendar availability");
  }

  const data = (await response.json()) as {
    calendars?: { primary?: { busy?: BusyBlock[] } };
  };
  return data.calendars?.primary?.busy ?? [];
}

function overlaps(slot: Slot, block: BusyBlock) {
  const busyStart = new Date(block.start).getTime();
  const busyEnd = new Date(block.end).getTime();
  return slot.start.getTime() < busyEnd && slot.end.getTime() > busyStart;
}

async function createCalendarEvent(accessToken: string, task: TaskRow, slot: Slot) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: task.title,
      description: `Tarea planificada desde La Lista.\nUrgencia: ${task.urgency}`,
      start: { dateTime: slot.start.toISOString(), timeZone: TIME_ZONE },
      end: { dateTime: slot.end.toISOString(), timeZone: TIME_ZONE },
    }),
  });

  if (!response.ok) {
    throw new Error("Could not create Google Calendar event");
  }

  return (await response.json()) as { id: string; htmlLink?: string };
}

async function markTaskEventCreated(email: string, taskId: string, eventId: string) {
  const sql = getSql();
  await sql`
    UPDATE tasks
    SET event_created = TRUE, google_event_id = ${eventId}
    WHERE user_email = ${email} AND id = ${taskId}
  `;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
