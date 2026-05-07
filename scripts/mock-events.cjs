#!/usr/bin/env node
/**
 * Replays the demo timeline by appending JSONL events to
 * ~/.jarvis/activity.jsonl. Useful for verifying the Electron
 * integration end-to-end without launching a real AI agent.
 *
 *   node scripts/mock-events.cjs            # plays the full timeline
 *   node scripts/mock-events.cjs --once     # emits a single event
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const LOG = process.env.JARVIS_LOG || path.join(os.homedir(), ".jarvis", "activity.jsonl");
fs.mkdirSync(path.dirname(LOG), { recursive: true });

const timeline = [
  [0, { kind: "plan", message: "Reading the task brief" }],
  [1500, { kind: "think", message: "Decomposing into subtasks" }],
  [1800, { kind: "read", message: "Reading src/App.tsx", path: "src/App.tsx" }],
  [1500, { kind: "edit", message: "Editing src/App.tsx", path: "src/App.tsx" }],
  [1800, { kind: "command", message: "Running npm run lint", command: "npm run lint" }],
  [2200, { kind: "test", message: "Running npm test", command: "npm test" }],
  [3000, { kind: "debug", message: "Investigating failing assertion" }],
  [2500, { kind: "edit", message: "Editing src/state/stateMachine.ts", path: "src/state/stateMachine.ts" }],
  [2000, { kind: "test", message: "Running npm test", command: "npm test" }],
  [2500, { kind: "success", message: "All tests passed" }],
  [1500, { kind: "ship", message: "git commit -m 'fix: state precedence'", command: "git commit" }],
  [1500, { kind: "ship", message: "git push", command: "git push" }],
  [1500, { kind: "success", message: "Pushed to origin" }],
];

function emit(body) {
  const line =
    JSON.stringify({
      ...body,
      timestamp: Date.now(),
      source: body.source ?? "mock-events",
    }) + "\n";
  fs.appendFileSync(LOG, line);
  console.log(line.trim());
}

if (process.argv.includes("--once")) {
  emit(timeline[0][1]);
  process.exit(0);
}

let i = 0;
function tick() {
  if (i >= timeline.length) return;
  const [delay, body] = timeline[i++];
  setTimeout(() => {
    emit(body);
    tick();
  }, delay);
}
tick();
