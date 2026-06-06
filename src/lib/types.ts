export type TaskStatus = "Sin empezar" | "En proceso" | "Completada";
export type Urgency = "Alta" | "Media" | "Baja";
export type TaskType = "Personal" | "Carmen" | "Ambos" | "Casa" | "Otros";

export type Task = {
  id: string;
  title: string;
  urgency: Urgency;
  taskType: TaskType;
  highPriority: boolean;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  eventCreated: boolean;
  googleEventId: string | null;
};

export type Note = {
  id: string;
  text: string;
  createdAt: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  status: "needed" | "checked" | "missing";
  createdAt: string;
};

export type BoardData = {
  tasks: Task[];
  notes: Note[];
  categories: string[];
  shopping: ShoppingItem[];
};
