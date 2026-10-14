#!/usr/bin/env node
// Runs the backend (Express on :3001) and frontend (Vite on :5173) together,
// without extra dependencies. Output is prefixed per workspace; Ctrl+C stops both,
// and if either process exits the other is stopped too.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const colors = { backend: '\x1b[36m', frontend: '\x1b[35m' };
const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

for (const ws of ['backend', 'frontend']) {
  const child = spawn(npm, ['run', 'dev', '--workspace', ws], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const prefix = `${colors[ws]}[${ws}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) out.write(prefix + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) console.error(`${prefix}exited with code ${code}; stopping the other process`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stopAll(0));
