import { useEffect, useRef, useState } from "react";

interface CodexOutputFrame {
  stream: "stdout" | "stderr" | "system" | "event";
  text: string;
  timestamp: number;
}

interface CodexLine {
  stream: CodexOutputFrame["stream"];
  text: string;
  timestamp: number;
}

interface JarvisTailApi {
  onCodexOutput?: (cb: (frame: CodexOutputFrame) => void) => () => void;
}

/**
 * Subscribe to live Codex output and keep just the most recent N non-empty
 * lines so a small UI surface (e.g. the Terminal room CRT) can show a tail
 * without rendering the full transcript.
 */
export function useCodexTail(limit = 4): CodexLine[] {
  const [lines, setLines] = useState<CodexLine[]>([]);
  const partial = useRef<Partial<Record<CodexOutputFrame["stream"], string>>>({});

  useEffect(() => {
    const api = (window as unknown as { jarvis?: JarvisTailApi }).jarvis;
    if (!api?.onCodexOutput) return undefined;

    const off = api.onCodexOutput((frame) => {
      const buf = (partial.current[frame.stream] || "") + frame.text;
      const segments = buf.split(/\r?\n/);
      const tail = segments.pop() ?? "";
      partial.current[frame.stream] = tail;
      const flushed = segments.filter((line) => line.trim().length > 0);
      if (!flushed.length) return;
      setLines((prev) => {
        const next = [...prev];
        for (const text of flushed) {
          next.push({ stream: frame.stream, text, timestamp: frame.timestamp });
        }
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    });

    return off;
  }, [limit]);

  return lines;
}
