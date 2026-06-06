import { getSession } from "@/lib/auth";
import { ensureSchema, getSql } from "@/lib/db";
import type { BoardData, ShoppingItem, TaskStatus, TaskType, Urgency } from "@/lib/types";

const DEFAULT_CATEGORIES = ["Fruta", "Nevera", "Despensa"];

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureSchema();
  await ensureDefaultCategories(session.email);
  await cleanupCompletedTasks(session.email);

  return Response.json(await readBoard(session.email));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureSchema();
  const body = await request.json();
  const action = String(body.action ?? "");
  const sql = getSql();

  switch (action) {
    case "createTask":
      await sql`
        INSERT INTO tasks (id, user_email, title, urgency, task_type, high_priority, status)
        VALUES (
          ${crypto.randomUUID()},
          ${session.email},
          ${String(body.title ?? "").trim()},
          ${normalizeUrgency(body.urgency)},
          ${normalizeTaskType(body.taskType)},
          ${Boolean(body.highPriority)},
          'Sin empezar'
        )
      `;
      break;

    case "updateTask":
      await sql`
        UPDATE tasks SET
          status = ${normalizeStatus(body.status)},
          completed_at = ${body.completedAt ? new Date(body.completedAt).toISOString() : null}
        WHERE id = ${String(body.id)} AND user_email = ${session.email}
      `;
      break;

    case "editTask":
      await sql`
        UPDATE tasks SET
          title = ${String(body.title ?? "").trim()},
          urgency = ${normalizeUrgency(body.urgency)},
          task_type = ${normalizeTaskType(body.taskType)},
          high_priority = ${Boolean(body.highPriority)}
        WHERE id = ${String(body.id)} AND user_email = ${session.email}
      `;
      break;

    case "deleteTask":
      await sql`DELETE FROM tasks WHERE id = ${String(body.id)} AND user_email = ${session.email}`;
      break;

    case "createNote":
      await sql`
        INSERT INTO notes (id, user_email, text)
        VALUES (${crypto.randomUUID()}, ${session.email}, ${String(body.text ?? "").trim()})
      `;
      break;

    case "deleteNote":
      await sql`DELETE FROM notes WHERE id = ${String(body.id)} AND user_email = ${session.email}`;
      break;

    case "createCategory":
      await sql`
        INSERT INTO categories (id, user_email, name)
        VALUES (${crypto.randomUUID()}, ${session.email}, ${String(body.name ?? "").trim()})
        ON CONFLICT (user_email, name) DO NOTHING
      `;
      break;

    case "createShoppingItem":
      await sql`
        INSERT INTO shopping_items (id, user_email, name, category, status)
        VALUES (
          ${crypto.randomUUID()},
          ${session.email},
          ${String(body.name ?? "").trim()},
          ${String(body.category ?? "")},
          'needed'
        )
      `;
      break;

    case "updateShoppingItem":
      await sql`
        UPDATE shopping_items SET status = ${normalizeShoppingStatus(body.status)}
        WHERE id = ${String(body.id)} AND user_email = ${session.email}
      `;
      break;

    case "deleteShoppingItem":
      await sql`DELETE FROM shopping_items WHERE id = ${String(body.id)} AND user_email = ${session.email}`;
      break;

    default:
      return Response.json({ error: "Unknown board action" }, { status: 400 });
  }

  return Response.json(await readBoard(session.email));
}

async function readBoard(email: string): Promise<BoardData> {
  const sql = getSql();
  const [taskRows, noteRows, categoryRows, shoppingRows] = await Promise.all([
    sql`
      SELECT
        id, title, urgency, task_type, high_priority, status, created_at, completed_at,
        event_created, google_event_id
      FROM tasks
      WHERE user_email = ${email}
      ORDER BY
        completed_at NULLS FIRST,
        created_at ASC
    `,
    sql`
      SELECT id, text, created_at
      FROM notes
      WHERE user_email = ${email}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT name
      FROM categories
      WHERE user_email = ${email}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, name, category, status, created_at
      FROM shopping_items
      WHERE user_email = ${email}
      ORDER BY created_at ASC
    `,
  ]);

  return {
    tasks: rows(taskRows).map((task) => ({
      id: String(task.id),
      title: String(task.title),
      urgency: task.urgency as Urgency,
      taskType: normalizeTaskType(task.task_type),
      highPriority: Boolean(task.high_priority),
      status: task.status as TaskStatus,
      createdAt: new Date(String(task.created_at)).toISOString(),
      completedAt: task.completed_at ? new Date(String(task.completed_at)).toISOString() : null,
      eventCreated: Boolean(task.event_created),
      googleEventId: task.google_event_id ? String(task.google_event_id) : null,
    })),
    notes: rows(noteRows).map((note) => ({
      id: String(note.id),
      text: String(note.text),
      createdAt: new Date(String(note.created_at)).toISOString(),
    })),
    categories: rows(categoryRows).map((category) => String(category.name)),
    shopping: rows(shoppingRows).map((item) => ({
      id: String(item.id),
      name: String(item.name),
      category: String(item.category),
      status: item.status as ShoppingItem["status"],
      createdAt: new Date(String(item.created_at)).toISOString(),
    })),
  };
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

async function ensureDefaultCategories(email: string) {
  const sql = getSql();
  for (const name of DEFAULT_CATEGORIES) {
    await sql`
      INSERT INTO categories (id, user_email, name)
      VALUES (${crypto.randomUUID()}, ${email}, ${name})
      ON CONFLICT (user_email, name) DO NOTHING
    `;
  }
}

async function cleanupCompletedTasks(email: string) {
  const sql = getSql();
  await sql`
    DELETE FROM tasks
    WHERE user_email = ${email}
      AND completed_at IS NOT NULL
      AND (
        (high_priority = TRUE AND completed_at < NOW() - INTERVAL '30 days')
        OR (high_priority = FALSE AND urgency = 'Media' AND completed_at < NOW() - INTERVAL '15 days')
        OR (high_priority = FALSE AND urgency <> 'Media' AND completed_at < NOW() - INTERVAL '7 days')
      )
  `;
}

function normalizeUrgency(value: unknown): Urgency {
  if (value === "Alta" || value === "Media" || value === "Baja") return value;
  return "Baja";
}

function normalizeTaskType(value: unknown): TaskType {
  if (value === "Personal" || value === "Carmen" || value === "Ambos" || value === "Casa" || value === "Otros") {
    return value;
  }
  return "Otros";
}

function normalizeStatus(value: unknown): TaskStatus {
  if (value === "Sin empezar" || value === "En proceso" || value === "Completada") return value;
  return "Sin empezar";
}

function normalizeShoppingStatus(value: unknown): ShoppingItem["status"] {
  if (value === "needed" || value === "checked" || value === "missing") return value;
  return "needed";
}
