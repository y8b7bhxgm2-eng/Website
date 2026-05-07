import { describe, it, expect } from "vitest";
import { classify } from "@/utils/classifyEvent";

describe("classify", () => {
  it("classifies a chokidar file change as edit", () => {
    const ev = classify({ kind: "fileChange", path: "src/App.tsx", changeType: "change" });
    expect(ev.kind).toBe("edit");
    expect(ev.path).toBe("src/App.tsx");
    expect(ev.message).toContain("src/App.tsx");
  });

  it("classifies file add as edit (Created prefix)", () => {
    const ev = classify({ kind: "fileChange", path: "src/new.ts", changeType: "add" });
    expect(ev.kind).toBe("edit");
    expect(ev.message.startsWith("Created")).toBe(true);
  });

  it("classifies test commands as test", () => {
    const ev = classify({ kind: "command", command: "npm test" });
    expect(ev.kind).toBe("test");
  });

  it("classifies pytest as test", () => {
    expect(classify({ kind: "command", command: "pytest -k foo" }).kind).toBe("test");
  });

  it("classifies git push as ship", () => {
    expect(classify({ kind: "command", command: "git push origin main" }).kind).toBe("ship");
  });

  it("treats a successful exit code as success", () => {
    expect(classify({ kind: "command", command: "npm test", exitCode: 0 }).kind).toBe("success");
  });

  it("treats a non-zero exit code as error", () => {
    const ev = classify({ kind: "command", command: "npm test", exitCode: 1 });
    expect(ev.kind).toBe("error");
    expect(ev.message).toContain("exit 1");
  });

  it("classifies an error log line", () => {
    expect(classify({ kind: "logLine", line: "Error: something broke" }).kind).toBe("error");
  });

  it("classifies a passing test log line", () => {
    expect(classify({ kind: "logLine", line: "All tests passed ✓" }).kind).toBe("success");
  });

  it("falls back to think for unknown log lines", () => {
    expect(classify({ kind: "logLine", line: "lorem ipsum" }).kind).toBe("think");
  });
});
