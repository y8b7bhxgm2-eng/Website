const { contextBridge, ipcRenderer } = require("electron");

/**
 * Safe IPC surface exposed to the renderer.
 *
 *  - `onActivity(cb)` subscribes to events emitted by the main
 *    process (file watcher, log tailer, etc.). Returns an off()
 *    handle for cleanup.
 *  - `selectWorkspace()` opens a native folder picker for Codex runs.
 *  - `runCodex(request)` launches the local Codex CLI from the main process.
 *  - `emit(event)` lets the renderer push synthetic events back
 *    through the same fan-out (used by the demo button + tests).
 */
contextBridge.exposeInMainWorld("jarvis", {
  onActivity: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on("jarvis:activity", handler);
    return () => ipcRenderer.removeListener("jarvis:activity", handler);
  },
  onCodexStatus: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on("jarvis:codex-status", handler);
    return () => ipcRenderer.removeListener("jarvis:codex-status", handler);
  },
  onAgentStatus: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on("jarvis:agent-status", handler);
    return () => ipcRenderer.removeListener("jarvis:agent-status", handler);
  },
  selectWorkspace: () => ipcRenderer.invoke("jarvis:select-workspace"),
  runAgent: (request) => ipcRenderer.invoke("jarvis:agent-run", request),
  runCodex: (request) => ipcRenderer.invoke("jarvis:codex-run", request),
  emit: (event) => ipcRenderer.invoke("jarvis:emit", event),
});
