import express, { type Request, type Response } from "express";
import { validateTask, type TaskInput } from "./utils/validateTask.js";
import { addTask, listTasks } from "./tasks.js";

export const app = express();

app.use(express.json());

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/api/tasks", (_req: Request, res: Response) => {
  res.json(listTasks());
});

app.post("/api/tasks", (req: Request, res: Response) => {
  const result = validateTask(req.body);
  if (!result.valid) {
    res.status(400).json({ errors: result.errors });
    return;
  }
  const { title, priority } = req.body as TaskInput;
  res.status(201).json(addTask(title, priority));
});
