import type { ActivityEvent } from "@/types/activity";

let id = 0;
const makeId = () => `mock-${(id++).toString(36)}`;

/**
 * A scripted demo timeline. Each entry is `[delayMs, event]`. The
 * delay is relative to the *previous* event so the demo flows
 * naturally. Used by the in-app "Demo" button and by the optional
 * `npm run mock-events` script.
 */
export const demoTimeline: Array<[number, Omit<ActivityEvent, "id" | "timestamp">]> = [
  [0, { kind: "plan", message: "Reading the task brief", source: "demo" }],
  [1500, { kind: "think", message: "Decomposing into subtasks", source: "demo" }],
  [1800, { kind: "read", message: "Reading src/App.tsx", path: "src/App.tsx", source: "demo" }],
  [1200, { kind: "read", message: "Reading src/state/store.ts", path: "src/state/store.ts", source: "demo" }],
  [1500, { kind: "edit", message: "Editing src/App.tsx", path: "src/App.tsx", source: "demo" }],
  [2000, { kind: "edit", message: "Editing src/components/Avatar.tsx", path: "src/components/Avatar.tsx", source: "demo" }],
  [1800, { kind: "command", message: "Running npm run lint", command: "npm run lint", source: "demo" }],
  [2200, { kind: "test", message: "Running npm test", command: "npm test", source: "demo" }],
  [3000, { kind: "debug", message: "Investigating failing assertion in stateMachine.test.ts", source: "demo" }],
  [2500, { kind: "edit", message: "Editing src/state/stateMachine.ts", path: "src/state/stateMachine.ts", source: "demo" }],
  [2000, { kind: "test", message: "Running npm test", command: "npm test", source: "demo" }],
  [2500, { kind: "success", message: "All tests passed", source: "demo" }],
  [1500, { kind: "ship", message: "git commit -m 'fix: state precedence'", command: "git commit", source: "demo" }],
  [1500, { kind: "ship", message: "git push", command: "git push", source: "demo" }],
  [1500, { kind: "success", message: "Pushed to origin", source: "demo" }],
];

export function materialize(timeline: typeof demoTimeline): ActivityEvent[] {
  let t = Date.now();
  return timeline.map(([delay, body]) => {
    t += delay;
    return { id: makeId(), timestamp: t, ...body };
  });
}
