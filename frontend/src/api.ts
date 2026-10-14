export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  createdAt: string;
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error(`Failed to load tasks (${res.status})`);
  return res.json();
}

export async function createTask(title: string, priority: Priority): Promise<Task> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, priority }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
    throw new Error(body.errors?.join("; ") ?? `Failed to create task (${res.status})`);
  }
  return res.json();
}
