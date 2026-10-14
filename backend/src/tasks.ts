import type { Priority } from "./utils/validateTask.js";
import { slugify } from "./utils/slugify.js";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  createdAt: string;
}

const seed: Array<Pick<Task, "title" | "priority" | "done">> = [
  { title: "Write the commit skill", priority: "high", done: true },
  { title: "Add the test-writer agent", priority: "high", done: false },
  { title: "Wire up the /analyze command", priority: "medium", done: false },
  { title: "Run promptfoo eval and share the report", priority: "low", done: false },
];

let tasks: Task[] = [];

export function resetTasks(): void {
  tasks = seed.map((t, i) => ({
    ...t,
    id: `${i + 1}-${slugify(t.title)}`,
    createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
  }));
}

export function listTasks(): Task[] {
  return [...tasks];
}

export function addTask(title: string, priority: Priority): Task {
  const task: Task = {
    id: `${tasks.length + 1}-${slugify(title)}`,
    title: title.trim(),
    priority,
    done: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}

resetTasks();
