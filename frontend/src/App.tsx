import { useEffect, useState, type FormEvent } from "react";
import { createTask, fetchTasks, type Priority, type Task } from "./api";

const ARTIFACTS = [
  {
    name: "commit",
    kind: "Skill",
    path: ".claude/skills/commit/SKILL.md",
    description: "Creates safe, conventional commits. Never force-pushes or skips hooks.",
  },
  {
    name: "changelog",
    kind: "Skill",
    path: ".claude/skills/changelog/SKILL.md",
    description: "Writes a concise changelog entry from a diff or list of changes.",
  },
  {
    name: "test-writer",
    kind: "Agent",
    path: ".claude/agents/test-writer.md",
    description: "Subagent that only writes tests and never edits source code.",
  },
  {
    name: "/analyze",
    kind: "Command",
    path: ".claude/commands/analyze.md",
    description: "Slash command that produces a structured analysis of a file or area.",
  },
];

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  useEffect(() => {
    fetchTasks()
      .then(setTasks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const task = await createTask(title, priority);
      setTasks((prev) => [...prev, task]);
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Promptfoo Showcase</h1>
        <p>A tiny app used as a playground for evaluating Claude skills, agents and commands.</p>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Tasks</h2>
          {loading && <p className="muted">Loading...</p>}
          {error && <p className="error">{error}</p>}
          <ul className="tasks">
            {tasks.map((t) => (
              <li key={t.id} className={t.done ? "done" : undefined}>
                <span>{t.title}</span>
                <span className={`badge ${t.priority}`}>{t.priority}</span>
              </li>
            ))}
          </ul>

          <form className="form" onSubmit={handleSubmit}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task title"
              aria-label="Task title"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              aria-label="Priority"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
            <button type="submit">Add</button>
          </form>
        </section>

        <section className="card">
          <h2>Claude artifacts</h2>
          <ul className="artifacts">
            {ARTIFACTS.map((a) => (
              <li key={a.name}>
                <div>
                  <strong>{a.name}</strong> <span className="kind">{a.kind}</span>
                </div>
                <p>{a.description}</p>
                <code>{a.path}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
