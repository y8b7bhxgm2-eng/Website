import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

interface CodexOutputFrame {
  stream: "stdout" | "stderr" | "system" | "event";
  text: string;
  timestamp: number;
}

interface JarvisTerminalApi {
  onCodexOutput?: (cb: (frame: CodexOutputFrame) => void) => () => void;
  stopCodex?: () => Promise<{ ok: boolean; error?: string }>;
}

function jarvisApi(): JarvisTerminalApi | undefined {
  return (window as unknown as { jarvis?: JarvisTerminalApi }).jarvis;
}

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function CodexTerminal() {
  const api = useMemo(jarvisApi, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const linesRef = useRef(0);
  const [hasOutput, setHasOutput] = useState(false);

  const writeFrame = useCallback((frame: CodexOutputFrame) => {
    const term = termRef.current;
    if (!term) return;
    const text = frame.text.replace(/(?<!\r)\n/g, "\r\n");
    if (frame.stream === "stderr") {
      term.write(`\x1b[31m${text}${RESET}`);
    } else if (frame.stream === "system") {
      term.write(text);
    } else {
      term.write(text);
    }
    linesRef.current += text.split("\r\n").length - 1;
    setHasOutput(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const term = new XTerm({
      fontFamily: "JetBrains Mono, Fira Code, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: false,
      cursorStyle: "bar",
      scrollback: 4000,
      convertEol: true,
      disableStdin: true,
      allowTransparency: true,
      theme: {
        background: "rgba(0,0,0,0)",
        foreground: "#e6eaf2",
        cursor: "#cccccc",
        cursorAccent: "#000",
        selectionBackground: "rgba(255,255,255,0.18)",
        black: "#0a0a0a",
        red: "#d97766",
        green: "#a3d977",
        yellow: "#e5c07b",
        blue: "#9aa9c2",
        magenta: "#c9a0e1",
        cyan: "#88c0d0",
        white: "#e6eaf2",
        brightBlack: "#666666",
        brightRed: "#ef9484",
        brightGreen: "#bce598",
        brightYellow: "#f0d399",
        brightBlue: "#b8c5dd",
        brightMagenta: "#d8b8ec",
        brightCyan: "#a4d4e4",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.write(`${DIM}${"\u2500".repeat(48)}${RESET}\r\n`);
    term.write(`${DIM}Codex live output. Streaming stdout, stderr, and parsed events.${RESET}\r\n`);
    term.write(`${DIM}${"\u2500".repeat(48)}${RESET}\r\n`);

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        // ignore — fit can throw if the container is hidden
      }
    };
    window.addEventListener("resize", onResize);

    let off: (() => void) | undefined;
    if (api?.onCodexOutput) {
      off = api.onCodexOutput((frame) => writeFrame(frame));
    }

    return () => {
      window.removeEventListener("resize", onResize);
      off?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [api, writeFrame]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
    linesRef.current = 0;
    setHasOutput(false);
  }, []);

  const handleCopy = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const sel = term.getSelection();
    const text = sel || (term.buffer.active.length > 0 ? extractAllText(term) : "");
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore — clipboard may be denied in some contexts
      }
    }
  }, []);

  return (
    <section className="terminal-panel">
      <header className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-dot dot-red" aria-hidden />
          <span className="terminal-dot dot-amber" aria-hidden />
          <span className="terminal-dot dot-green" aria-hidden />
          <span className="terminal-label">codex.live</span>
          <span className="terminal-meta">{hasOutput ? "stream open" : "idle"}</span>
        </div>
        <div className="terminal-actions">
          <button type="button" className="btn btn-ghost btn-mini" onClick={handleCopy}>
            Copy
          </button>
          <button type="button" className="btn btn-ghost btn-mini" onClick={handleClear}>
            Clear
          </button>
        </div>
      </header>
      <div ref={containerRef} className="terminal-surface" />
      <footer className="terminal-footer">
        <span>{api?.onCodexOutput ? "live IPC connected" : "open in Electron for live output"}</span>
        <span className="terminal-hint">Esc-style ANSI colors supported</span>
      </footer>
    </section>
  );
}

function extractAllText(term: XTerm): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    lines.push(line.translateToString(true));
  }
  return lines.join("\n");
}
