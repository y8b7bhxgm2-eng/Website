import { useJarvisStore } from "@/state/store";
import { Rooms } from "@/state/stateMachine";
import type { AgentState } from "@/types/activity";

const STATE_LABEL: Record<AgentState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  reading: "Reading",
  editing: "Editing",
  running: "Running command",
  testing: "Testing",
  debugging: "Debugging",
  shipping: "Shipping",
  success: "Success",
  error: "Error",
};

const STATE_DOT: Record<AgentState, string> = {
  idle: "#444444",
  thinking: "#cccccc",
  reading: "#ffffff",
  editing: "#ffffff",
  running: "#dddddd",
  testing: "#aaaaaa",
  debugging: "#888888",
  shipping: "#eeeeee",
  success: "#ffffff",
  error: "#666666",
};

interface StatusBarProps {
  onDemo: () => void;
  onReset: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
  onOpenMemory?: () => void;
}

export function StatusBar({ onDemo, onReset, theme, onThemeChange, onOpenMemory }: StatusBarProps) {
  const fsm = useJarvisStore((s) => s.fsm);
  const room = Rooms[fsm.room];
  const active = fsm.state !== "idle" && fsm.state !== "success" && fsm.state !== "error";

  return (
    <header className="statusbar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">Jarvis</span>
        <span className="brand-tag">AI Workspace</span>
      </div>
      <div className={`status ${active ? "status-active" : ""}`}>
        <span
          className="status-dot"
          style={{ background: STATE_DOT[fsm.state], color: STATE_DOT[fsm.state] }}
        />
        <span className="status-label">{STATE_LABEL[fsm.state]}</span>
        <span className="status-room">in {room.label}</span>
      </div>
      <div className="actions">
        <select
          className="btn btn-ghost"
          value={theme}
          onChange={(e) => {
            onThemeChange(e.target.value);
            e.target.blur();
          }}
          title="Themes"
        >
          <option value="monochrome">Theme: Premium Monochrome</option>
          <option value="matrix">Theme: Matrix Rain</option>
        </select>
        {onOpenMemory ? (
          <button type="button" className="btn btn-ghost" onClick={onOpenMemory} title="Open Memory Hub">
            Memory
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="btn btn-primary" onClick={onDemo}>
          Run demo
        </button>
      </div>
    </header>
  );
}
