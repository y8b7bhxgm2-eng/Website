import { useCallback, useEffect, useMemo, useState } from "react";

type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
type CodexSpeed = "standard" | "fast";
type CodexModel =
  | "gpt-5.5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex"
  | "gpt-5.3-codex-spark"
  | "gpt-5.2";
type AgentProvider = "codex" | "windsurf";
type AgentRunResult = { ok: boolean; error?: string; message?: string };
type AgentStatus = { running: boolean; exitCode?: number; provider?: AgentProvider; message?: string; model?: CodexModel };

interface JarvisApi {
  selectWorkspace?: () => Promise<string | null>;
  runAgent?: (request: {
    provider: AgentProvider;
    workspace: string;
    prompt: string;
    model: CodexModel;
    reasoningEffort: ReasoningEffort;
    speed: CodexSpeed;
    memoryContext?: boolean;
  }) => Promise<AgentRunResult>;
  runCodex?: (request: {
    workspace: string;
    prompt: string;
    model: CodexModel;
    reasoningEffort: ReasoningEffort;
    speed?: CodexSpeed;
    memoryContext?: boolean;
  }) => Promise<AgentRunResult>;
  stopCodex?: () => Promise<{ ok: boolean; error?: string }>;
  onAgentStatus?: (cb: (status: AgentStatus) => void) => () => void;
  onCodexStatus?: (cb: (status: AgentStatus) => void) => () => void;
}

const PROVIDER_OPTIONS: Array<{
  value: AgentProvider;
  label: string;
  description: string;
}> = [
  { value: "codex", label: "Codex", description: "Run and mirror" },
  { value: "windsurf", label: "Windsurf", description: "Open + copy task" },
];

const REASONING_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
  description: string;
}> = [
  { value: "low", label: "Low", description: "Fastest" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "high", label: "High", description: "Deeper" },
  { value: "xhigh", label: "Extra High", description: "Max depth" },
];

const MODEL_OPTIONS: Array<{
  value: CodexModel;
  label: string;
  description: string;
}> = [
  { value: "gpt-5.5", label: "GPT-5.5", description: "Latest" },
  { value: "gpt-5.4", label: "GPT-5.4", description: "Strong" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Compact" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex", description: "Code tuned" },
  { value: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", description: "Real-time" },
  { value: "gpt-5.2", label: "GPT-5.2", description: "Legacy" },
];

const SPEED_OPTIONS: Array<{
  value: CodexSpeed;
  label: string;
  description: string;
}> = [
  { value: "standard", label: "Standard", description: "Normal usage" },
  { value: "fast", label: "Fast", description: "1.5x speed" },
];

const DEFAULT_PROMPT = "Run the tests and fix any failures.";

function isReasoningEffort(value: string | null): value is ReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function isAgentProvider(value: string | null): value is AgentProvider {
  return value === "codex" || value === "windsurf";
}

function isCodexSpeed(value: string | null): value is CodexSpeed {
  return value === "standard" || value === "fast";
}

function isCodexModel(value: string | null): value is CodexModel {
  return (
    value === "gpt-5.5" ||
    value === "gpt-5.4" ||
    value === "gpt-5.4-mini" ||
    value === "gpt-5.3-codex" ||
    value === "gpt-5.3-codex-spark" ||
    value === "gpt-5.2"
  );
}

function jarvisApi(): JarvisApi | undefined {
  return (window as unknown as { jarvis?: JarvisApi }).jarvis;
}

export function CodexPanel() {
  const api = useMemo(jarvisApi, []);
  const [provider, setProvider] = useState<AgentProvider>(() => {
    const saved = localStorage.getItem("jarvis.provider");
    return isAgentProvider(saved) ? saved : "codex";
  });
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("jarvis.workspace") ?? "");
  const [prompt, setPrompt] = useState(() => localStorage.getItem("jarvis.lastPrompt") || DEFAULT_PROMPT);
  const [memoryContext, setMemoryContext] = useState(
    () => localStorage.getItem("jarvis.memoryContext") !== "off",
  );
  const [model, setModel] = useState<CodexModel>(() => {
    const saved = localStorage.getItem("jarvis.codexModel");
    return isCodexModel(saved) ? saved : "gpt-5.5";
  });
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => {
    const saved = localStorage.getItem("jarvis.reasoningEffort");
    return isReasoningEffort(saved) ? saved : "medium";
  });
  const [speed, setSpeed] = useState<CodexSpeed>(() => {
    const saved = localStorage.getItem("jarvis.codexSpeed");
    return isCodexSpeed(saved) ? saved : "standard";
  });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(api?.runAgent || api?.runCodex ? "Ready to launch an agent" : "Open in Electron to run agents");

  useEffect(() => {
    localStorage.setItem("jarvis.provider", provider);
  }, [provider]);

  useEffect(() => {
    if (workspace) localStorage.setItem("jarvis.workspace", workspace);
  }, [workspace]);

  useEffect(() => {
    localStorage.setItem("jarvis.reasoningEffort", reasoningEffort);
  }, [reasoningEffort]);

  useEffect(() => {
    localStorage.setItem("jarvis.codexModel", model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem("jarvis.codexSpeed", speed);
  }, [speed]);

  useEffect(() => {
    localStorage.setItem("jarvis.lastPrompt", prompt);
  }, [prompt]);

  useEffect(() => {
    localStorage.setItem("jarvis.memoryContext", memoryContext ? "on" : "off");
  }, [memoryContext]);

  useEffect(() => {
    const subscribe = api?.onAgentStatus ?? api?.onCodexStatus;
    if (!subscribe) return undefined;
    return subscribe((status) => {
      if (status.provider && status.provider !== provider) return;
      setRunning(status.running);
      if (!status.running) {
        if (status.message) {
          setMessage(status.message);
        } else if (provider === "windsurf") {
          setMessage(status.exitCode ? `Windsurf handoff stopped with code ${status.exitCode}` : "Windsurf opened");
        } else {
          setMessage(status.exitCode ? `Codex stopped with code ${status.exitCode}` : "Codex finished");
        }
      }
    });
  }, [api, provider]);

  const chooseWorkspace = useCallback(async () => {
    if (!api?.selectWorkspace) {
      setMessage("Folder picker is available in the Electron app");
      return;
    }
    const selected = await api.selectWorkspace();
    if (selected) {
      setWorkspace(selected);
      setMessage("Workspace selected");
    }
  }, [api]);

  const runAgent = useCallback(async () => {
    if (!api?.runAgent && !api?.runCodex) {
      setMessage("Open Jarvis in Electron to launch agents");
      return;
    }
    if (provider === "windsurf" && !api.runAgent) {
      setMessage("Update/reload the Electron app to use Windsurf handoff");
      return;
    }
    const task = prompt.trim();
    if (!workspace.trim()) {
      setMessage("Choose a workspace folder first");
      return;
    }
    if (!task) {
      setMessage(`Enter a task for ${provider === "windsurf" ? "Windsurf" : "Codex"}`);
      return;
    }

    setRunning(true);
    setMessage(provider === "windsurf" ? "Opening Windsurf..." : "Launching Codex...");
    const result = api.runAgent
      ? await api.runAgent({
          provider,
          workspace: workspace.trim(),
          prompt: task,
          model,
          reasoningEffort,
          speed,
          memoryContext,
        })
      : await api.runCodex?.({
          workspace: workspace.trim(),
          prompt: task,
          model,
          reasoningEffort,
          speed,
          memoryContext,
        });

    if (!result?.ok) {
      setRunning(false);
      setMessage(result?.error ?? `Could not launch ${provider === "windsurf" ? "Windsurf" : "Codex"}`);
    } else if (provider === "windsurf") {
      setRunning(false);
      setMessage(result.message ?? "Windsurf opened; task copied to clipboard");
    }
  }, [api, model, memoryContext, prompt, provider, reasoningEffort, speed, workspace]);

  const stopAgent = useCallback(async () => {
    if (!api?.stopCodex) {
      setMessage("Stop is only available in the Electron app");
      return;
    }
    setMessage("Stopping Codex...");
    const result = await api.stopCodex();
    if (!result?.ok) {
      setMessage(result?.error ?? "Could not stop Codex");
    }
  }, [api]);

  return (
    <section className="codex-panel">
      <div className="codex-panel-main">
        <div className="codex-heading">
          <span className="codex-kicker">Agent Mission Control</span>
          <strong>Choose a provider and task</strong>
        </div>
        <label className="workspace-field">
          <span>Workspace</span>
          <div className="workspace-row">
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="Choose or paste a project folder"
            />
            <button type="button" className="btn btn-ghost" onClick={chooseWorkspace}>
              Browse
            </button>
          </div>
        </label>
        <label className="prompt-field">
          <span>Task</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        </label>
      </div>

      <div className="codex-panel-side">
        <div className="provider-group" role="radiogroup" aria-label="Agent provider">
          {PROVIDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`provider-option ${provider === option.value ? "provider-option-active" : ""}`}
              onClick={() => setProvider(option.value)}
              aria-pressed={provider === option.value}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        {provider === "codex" && (
          <>
            <div className="model-group" role="radiogroup" aria-label="Codex model">
              {MODEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`model-option ${model === option.value ? "model-option-active" : ""}`}
                  onClick={() => setModel(option.value)}
                  aria-pressed={model === option.value}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
            <div className="speed-group" role="radiogroup" aria-label="Codex speed">
              {SPEED_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`speed-option ${speed === option.value ? "speed-option-active" : ""}`}
                  onClick={() => setSpeed(option.value)}
                  aria-pressed={speed === option.value}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
            <div className="reasoning-group" role="radiogroup" aria-label="Codex reasoning effort">
              {REASONING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`reasoning-option ${reasoningEffort === option.value ? "reasoning-option-active" : ""}`}
                  onClick={() => setReasoningEffort(option.value)}
                  aria-pressed={reasoningEffort === option.value}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {provider === "codex" && (
          <label className="memory-toggle">
            <input
              type="checkbox"
              checked={memoryContext}
              onChange={(e) => setMemoryContext(e.target.checked)}
            />
            <span>Inject relevant memories</span>
          </label>
        )}
        <div className="codex-run-row">
          <button type="button" className="btn btn-primary codex-run" onClick={runAgent} disabled={running}>
            {running ? `${provider === "windsurf" ? "Windsurf" : "Codex"} running...` : `Run ${provider === "windsurf" ? "Windsurf" : "Codex"}`}
          </button>
          {provider === "codex" && running && api?.stopCodex && (
            <button type="button" className="btn btn-ghost btn-stop" onClick={stopAgent} title="Stop Codex (SIGINT)">
              Stop
            </button>
          )}
        </div>
        <span className="codex-message">{message}</span>
      </div>
    </section>
  );
}
