"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { BoardData, ShoppingItem, Task, TaskStatus, TaskType, Urgency } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const TASK_TYPES: TaskType[] = ["Personal", "Carmen", "Ambos", "Casa", "Otros"];

type Props = {
  userEmail: string;
  userName: string;
};

export function AppClient({ userEmail, userName }: Props) {
  const [activeTab, setActiveTab] = useState("tasks");
  const [board, setBoard] = useState<BoardData>({
    tasks: [],
    notes: [],
    categories: [],
    shopping: [],
  });
  const [noteSort, setNoteSort] = useState<"oldest" | "newest">("oldest");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadBoard();
  }, []);

  async function loadBoard() {
    const response = await fetch("/api/board");
    if (response.ok) {
      setBoard(await response.json());
    }
    setLoading(false);
  }

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (response.ok) {
      setBoard(await response.json());
    } else {
      const data = await response.json();
      setNotice(data.error ?? "No se pudo guardar");
    }
  }

  async function planCalendar() {
    setNotice("Buscando huecos en Google Calendar...");
    const response = await fetch("/api/calendar/plan", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo planificar");
      return;
    }
    await loadBoard();
    const count = data.created?.length ?? 0;
    setNotice(count ? `${count} eventos creados en Google Calendar.` : "No hay tareas elegibles para planificar.");
  }

  function switchTab(tab: string) {
    setActiveTab(tab);
    if (window.matchMedia("(max-width: 760px)").matches) {
      document.querySelector(`[data-panel="${tab}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }

  function syncTabFromScroll() {
    if (!window.matchMedia("(max-width: 760px)").matches || !mainRef.current) return;
    const panels = Array.from(mainRef.current.querySelectorAll<HTMLElement>("[data-panel]"));
    if (!panels.length) return;
    const nearest = panels.reduce((current, panel) => {
      const currentDistance = Math.abs(current.offsetLeft - mainRef.current!.scrollLeft);
      const panelDistance = Math.abs(panel.offsetLeft - mainRef.current!.scrollLeft);
      return panelDistance < currentDistance ? panel : current;
    }, panels[0]);
    if (nearest?.dataset.panel) setActiveTab(nearest.dataset.panel);
  }

  const openCount = board.tasks.filter((task) => !task.completedAt).length;

  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="kicker">Edicion diaria</p>
          <h1>La Lista</h1>
        </div>
        <div>
          <div className="date-plate">
            <span>{formatToday()}</span>
            <strong>{openCount} abiertas</strong>
          </div>
          <div className="user-bar">
            <span>{userName || userEmail}</span>
            <a className="user-link" href="/api/auth/logout">
              Salir
            </a>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        {[
          ["tasks", "Tareas"],
          ["notes", "Notas"],
          ["shopping", "Compra"],
        ].map(([id, label]) => (
          <button
            className={`tab ${activeTab === id ? "is-active" : ""}`}
            type="button"
            data-tab={id}
            key={id}
            onClick={() => switchTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice ? <div className="notice">{notice}</div> : null}

      <main ref={mainRef} onScroll={syncTabFromScroll}>
        <section className={`panel ${activeTab === "tasks" ? "is-active" : ""}`} data-panel="tasks">
          <TaskPanel tasks={board.tasks} loading={loading} mutate={mutate} planCalendar={planCalendar} />
        </section>

        <section className={`panel ${activeTab === "notes" ? "is-active" : ""}`} data-panel="notes">
          <NotesPanel notes={board.notes} noteSort={noteSort} setNoteSort={setNoteSort} mutate={mutate} />
        </section>

        <section className={`panel ${activeTab === "shopping" ? "is-active" : ""}`} data-panel="shopping">
          <ShoppingPanel board={board} mutate={mutate} />
        </section>
      </main>
    </div>
  );
}

function TaskPanel({
  tasks,
  loading,
  mutate,
  planCalendar,
}: {
  tasks: Task[];
  loading: boolean;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  planCalendar: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("Alta");
  const [taskType, setTaskType] = useState<TaskType>("Personal");
  const [highPriority, setHighPriority] = useState(false);
  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await mutate("createTask", { title, urgency, taskType, highPriority });
    setTitle("");
    setUrgency("Alta");
    setTaskType("Personal");
    setHighPriority(false);
  }

  return (
    <>
      <div className="toolbelt">
        <form className="entry-form task-form" onSubmit={submit}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nueva tarea" required />
          <select value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)} aria-label="Urgencia">
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)} aria-label="Tipo de tarea">
            {TASK_TYPES.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="toggle">
            <input checked={highPriority} onChange={(event) => setHighPriority(event.target.checked)} type="checkbox" />
            <span>Prioridad alta</span>
          </label>
          <button type="submit">Anadir</button>
        </form>
        <button className="secondary-action" type="button" onClick={planCalendar}>
          Plan Google
        </button>
      </div>
      <div className="card-grid task-grid">
        {loading ? <EmptyState text="Cargando" /> : null}
        {!loading && !sortedTasks.length ? <EmptyState text="No hay tareas todavia" /> : null}
        {sortedTasks.map((task) => (
          <TaskCard key={task.id} task={task} mutate={mutate} />
        ))}
      </div>
    </>
  );
}

function TaskCard({
  task,
  mutate,
}: {
  task: Task;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const age = daysSince(task.createdAt);
  const done = Boolean(task.completedAt);
  const className = [
    "task-card",
    "card",
    typeClass(task.taskType),
    !done && age >= 10 ? "danger" : "",
    !done && age >= 5 && age < 10 ? "warn" : "",
    done ? "done" : "",
  ]
    .filter(Boolean)
    .join(" ");

  async function complete() {
    const nextDone = !task.completedAt;
    await mutate("updateTask", {
      id: task.id,
      status: nextDone ? "Completada" : "Sin empezar",
      completedAt: nextDone ? new Date().toISOString() : null,
    });
  }

  async function progress() {
    if (task.completedAt) return;
    const status: TaskStatus = task.status === "Sin empezar" ? "En proceso" : "Sin empezar";
    await mutate("updateTask", { id: task.id, status, completedAt: null });
  }

  return (
    <article className={className}>
      <div className="card-topline">
        <span className="status-pill">{done ? "Completada" : task.status}</span>
        <span className="type-pill">{task.taskType}</span>
        <span className="age-label">{done ? `hecha hace ${daysSince(task.completedAt!)}d` : `abierta ${age}d`}</span>
      </div>
      <h2>{task.title}</h2>
      <div className="danger-row" aria-label="Prioridad">
        {Array.from({ length: priorityLevel(task) }).map((_, index) => (
          <span className="danger-mark" key={index}>
            !
          </span>
        ))}
      </div>
      <div className="card-actions">
        <button className="icon-button complete-button" type="button" title="Completar" onClick={complete}>
          ✓
        </button>
        <button className="status-button progress-button" type="button" onClick={progress} disabled={done}>
          {task.status === "En proceso" ? "Sin empezar" : "En proceso"}
        </button>
        <button className="icon-button event-button" type="button" title={task.googleEventId ?? "Evento pendiente"} disabled>
          ▣
        </button>
        <button className="icon-button delete-button" type="button" title="Eliminar" onClick={() => mutate("deleteTask", { id: task.id })}>
          ×
        </button>
      </div>
    </article>
  );
}

function typeClass(type: TaskType) {
  return `type-${type.toLowerCase()}`;
}

function NotesPanel({
  notes,
  noteSort,
  setNoteSort,
  mutate,
}: {
  notes: BoardData["notes"];
  noteSort: "oldest" | "newest";
  setNoteSort: (sort: "oldest" | "newest") => void;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const sortedNotes = [...notes].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return noteSort === "oldest" ? delta : -delta;
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await mutate("createNote", { text });
    setText("");
  }

  return (
    <>
      <div className="toolbelt">
        <form className="entry-form" onSubmit={submit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Nueva nota" required />
          <button type="submit">Anadir</button>
        </form>
        <div className="segmented" role="group" aria-label="Orden de notas">
          <button className={`segment ${noteSort === "oldest" ? "is-active" : ""}`} type="button" onClick={() => setNoteSort("oldest")}>
            Antiguas
          </button>
          <button className={`segment ${noteSort === "newest" ? "is-active" : ""}`} type="button" onClick={() => setNoteSort("newest")}>
            Recientes
          </button>
        </div>
      </div>
      <div className="card-grid">
        {!sortedNotes.length ? <EmptyState text="No hay notas todavia" /> : null}
        {sortedNotes.map((note) => (
          <article className="note-card card" key={note.id}>
            <span className="age-label">hace {daysSince(note.createdAt)}d</span>
            <p>{note.text}</p>
            <button className="icon-button delete-button" type="button" title="Eliminar" onClick={() => mutate("deleteNote", { id: note.id })}>
              ×
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function ShoppingPanel({
  board,
  mutate,
}: {
  board: BoardData;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(board.categories[0] ?? "");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (!category && board.categories[0]) setCategory(board.categories[0]);
  }, [board.categories, category]);

  async function submitItem(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !category) return;
    await mutate("createShoppingItem", { name, category });
    setName("");
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (!newCategory.trim()) return;
    await mutate("createCategory", { name: newCategory });
    setCategory(newCategory);
    setNewCategory("");
  }

  return (
    <>
      <div className="toolbelt shopping-tools">
        <form className="entry-form shopping-form" onSubmit={submitItem}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Producto" required />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoria">
            {board.categories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="submit">Anadir</button>
        </form>
        <form className="entry-form category-form" onSubmit={submitCategory}>
          <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Categoria" required />
          <button type="submit">Crear categoria</button>
        </form>
      </div>
      <div className="market-board">
        {board.categories.map((item) => (
          <section className="category-block" key={item}>
            <div className="category-heading">
              <h2>{item}</h2>
              <span className="age-label">{board.shopping.filter((entry) => entry.category === item).length} items</span>
            </div>
            <div className="shop-grid">
              {board.shopping.filter((entry) => entry.category === item).length ? null : <EmptyState text="Vacio" />}
              {board.shopping
                .filter((entry) => entry.category === item)
                .map((entry) => (
                  <ShoppingCard item={entry} mutate={mutate} key={entry.id} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ShoppingCard({
  item,
  mutate,
}: {
  item: ShoppingItem;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const nextStatus = item.status === "needed" ? "checked" : item.status === "checked" ? "missing" : "needed";
  return (
    <article className={`shop-card ${item.status === "checked" ? "checked" : ""} ${item.status === "missing" ? "missing" : ""}`}>
      <button className="shop-toggle" type="button" onClick={() => mutate("updateShoppingItem", { id: item.id, status: nextStatus })}>
        {item.status === "missing" ? `FALTA: ${item.name}` : item.name}
      </button>
      <button className="icon-button delete-button" type="button" title="Eliminar" onClick={() => mutate("deleteShoppingItem", { id: item.id })}>
        ×
      </button>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (a.completedAt && !b.completedAt) return 1;
    if (!a.completedAt && b.completedAt) return -1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function priorityLevel(task: Task) {
  if (task.highPriority) return 3;
  if (task.urgency === "Alta") return 3;
  if (task.urgency === "Media") return 2;
  return 1;
}

function daysSince(dateValue: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateValue).getTime()) / DAY));
}

function formatToday() {
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date());
}
