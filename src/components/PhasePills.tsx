import { useMemo } from "react";
import { useJarvisStore } from "@/state/store";
import type { AgentState } from "@/types/activity";

type Phase = "task" | "workspace" | "agents" | "review";

const PHASE_ORDER: Phase[] = ["task", "workspace", "agents", "review"];
const PHASE_LABELS: Record<Phase, string> = {
  task: "Task",
  workspace: "Workspace",
  agents: "Agents",
  review: "Review",
};

const STATE_TO_PHASE: Record<AgentState, Phase> = {
  idle: "task",
  thinking: "workspace",
  reading: "workspace",
  editing: "agents",
  running: "agents",
  testing: "agents",
  debugging: "agents",
  shipping: "review",
  success: "review",
  error: "review",
};

/**
 * Workflow phase pills inspired by the BridgeSpace style guide.
 * Drives directly off the FSM, so the highlight tracks real activity.
 */
export function PhasePills() {
  const state = useJarvisStore((s) => s.fsm.state);
  const active: Phase = useMemo(() => STATE_TO_PHASE[state] ?? "task", [state]);

  return (
    <nav className="phase-pills" aria-label="Pipeline phase">
      {PHASE_ORDER.map((phase, i) => {
        const isActive = phase === active;
        const isPast = PHASE_ORDER.indexOf(active) > i;
        return (
          <div key={phase} className="phase-pill-wrap">
            <span
              className={`phase-pill ${isActive ? "phase-pill-active" : ""} ${isPast ? "phase-pill-past" : ""}`}
              data-phase={phase}
            >
              <span className="phase-dot" aria-hidden />
              <span className="phase-label">{PHASE_LABELS[phase]}</span>
            </span>
            {i < PHASE_ORDER.length - 1 ? <span className="phase-arrow" aria-hidden>→</span> : null}
          </div>
        );
      })}
    </nav>
  );
}
