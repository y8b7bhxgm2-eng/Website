# AGENTS.md

Guidance for AI agents (and humans) working in this repo.

## Project layout

See [`README.md`](README.md) for the full file tree. The short version:

- `src/` — React + TypeScript renderer.
- `electron/` — Electron main process (CommonJS, no build step).
- `scripts/` — CLI helpers (`jarvis-wrap.sh`, `mock-events.cjs`).
- `test/` — Vitest unit tests.
- `docs/` — Architecture and MVP scope notes.

## Commands

| Task | Command |
| --- | --- |
| Install deps | `npm install` |
| Run renderer in browser | `npm run dev` |
| Run unit tests | `npm test` |
| Watch tests | `npm run test:watch` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Build renderer | `npm run build` |
| Launch Electron | `npm run electron:dev` (after `npm run build`) |
| Replay mock events | `node scripts/mock-events.cjs` |

`npm test` is the canonical TEST_COMMAND for verifying state transitions.

## Conventions

- TypeScript strict mode is on. Don't reach for `any`; the activity event model is small
  enough to type fully.
- The pure FSM in `src/state/stateMachine.ts` has zero React or DOM imports. Keep it that
  way — it's the easiest part to test, and we want to keep it that way.
- New `ActivityKind` values must be added to:
  1. `src/types/activity.ts`
  2. The `KIND_TO_STATE` and (if introducing a new state) `STATE_TO_ROOM` maps in
     `src/state/stateMachine.ts`
  3. The icon and color maps in `src/components/ActivityFeed.tsx`
  4. The status bar maps in `src/components/StatusBar.tsx`
  5. A unit test in `test/stateMachine.test.ts`
- All visual styling lives in `src/index.css` using CSS custom properties from `:root`.
  Don't introduce a new design system without discussion.
- Don't commit secrets, `.env`, or build artefacts. `.gitignore` covers the usual suspects.

## When in doubt

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first. It documents every cross-cutting
decision (why Electron, why JSONL, why precedence rules look the way they do).
