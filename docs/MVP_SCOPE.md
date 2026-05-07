# MVP Scope

## In scope

- 2D building cutaway (6 rooms), dark-mode-first, smooth animations.
- Animated worker avatar with the 9 distinct visual states from the brief.
- Activity feed with categorized icons and relative timestamps.
- Pure FSM with precedence + idle-decay rules; >90% logic coverage via unit tests.
- Activity event data model (single `ActivityEvent` interface used everywhere).
- Demo timeline + "Run demo" button to drive the UI without any integration.
- Electron shell with main window, system tray, and a floating mini-window mode.
- Integration layer: JSONL log tailer (`~/.jarvis/activity.jsonl`) + shell wrapper script.
- Browser fallbacks for development without Electron (BroadcastChannel + CustomEvent).
- Linting, typechecking, and unit tests wired into npm scripts.

## Out of scope (post-MVP)

- Persisting activity history across sessions (DB or file).
- Multi-project support (which repo is "active").
- A first-class chokidar file watcher tied to a project root (we ship the classifier and
  scaffolding; the wiring is left to integrators because policy-on-which-paths-to-watch
  varies).
- Direct Codex / OpenAI Responses streaming integration (the JSONL channel covers this with
  a ~10-line emitter on the agent side).
- Auto-update, signed builds, code-signing, notarization.
- Localization.
- Telemetry of any kind (explicitly declined).

## Acceptance criteria

1. `npm test` passes deterministically.
2. `npm run lint` and `npm run typecheck` pass with zero errors.
3. `npm run dev` opens a working renderer; clicking **Run demo** walks the worker through
   all 6 rooms across success and error states.
4. Appending a JSON line to `~/.jarvis/activity.jsonl` (when running under Electron) updates
   the renderer within ~250ms.
5. `scripts/jarvis-wrap.sh test -- npm test` produces a "Running …" event followed by either
   a `success` or `error` event with the exit code.
