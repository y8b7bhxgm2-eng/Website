const fs = require("node:fs");

const ACTIVITY_KINDS = new Set([
  "plan",
  "think",
  "read",
  "edit",
  "command",
  "test",
  "debug",
  "ship",
  "success",
  "error",
  "idle",
]);

function normalizeActivityEvent(parsed) {
  if (!parsed || typeof parsed !== "object" || !ACTIVITY_KINDS.has(parsed.kind)) {
    return null;
  }

  return {
    id:
      typeof parsed.id === "string"
        ? parsed.id
        : `tail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp:
      typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp)
        ? parsed.timestamp
        : Date.now(),
    kind: parsed.kind,
    message: typeof parsed.message === "string" ? parsed.message : `${parsed.kind} event`,
    path: typeof parsed.path === "string" ? parsed.path : undefined,
    command: typeof parsed.command === "string" ? parsed.command : undefined,
    source: typeof parsed.source === "string" ? parsed.source : "log",
    detail: parsed.detail && typeof parsed.detail === "object" ? parsed.detail : undefined,
  };
}

/**
 * Tails a JSONL file and forwards each parsed line to `onEvent`.
 *
 * Why JSONL?
 *  - Append-only, line-delimited JSON is the lowest-friction format
 *    any agent or shell wrapper can produce. `printf '{...}\n' >>
 *    ~/.jarvis/activity.jsonl` is a one-liner.
 *  - Lossless under crash: lines are atomic at the OS level when
 *    smaller than PIPE_BUF, so partial writes are extremely rare.
 *
 * Implementation notes:
 *  - We track the byte offset we've already consumed and re-open on
 *    truncation (file shrunk → new run, start over).
 *  - We poll with `fs.watchFile` rather than `fs.watch` because
 *    `fs.watch` is unreliable on some Linux setups, and JSONL
 *    log volumes are tiny.
 */
function startLogTailer(filePath, onEvent) {
  let offset = 0;
  try {
    offset = fs.statSync(filePath).size;
  } catch (_err) {
    offset = 0;
  }

  let buffered = "";
  const consume = () => {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (_err) {
      return;
    }
    if (stat.size < offset) {
      // Truncated — restart from the beginning.
      offset = 0;
      buffered = "";
    }
    if (stat.size === offset) return;

    const stream = fs.createReadStream(filePath, {
      start: offset,
      end: stat.size - 1,
      encoding: "utf8",
    });
    stream.on("data", (chunk) => {
      buffered += chunk;
      let nl = buffered.indexOf("\n");
      while (nl !== -1) {
        const line = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line);
            const event = normalizeActivityEvent(parsed);
            if (event) {
              onEvent(event);
            } else {
              console.warn("[jarvis] skipping invalid activity event");
            }
          } catch (err) {
            // Malformed line — skip silently. We don't want noisy
            // crashes from a bad log entry.
            console.warn("[jarvis] skipping malformed log line:", err.message);
          }
        }
        nl = buffered.indexOf("\n");
      }
    });
    stream.on("end", () => {
      offset = stat.size;
    });
  };

  fs.watchFile(filePath, { interval: 250 }, consume);
  // Catch up on any lines already present.
  consume();

  return () => fs.unwatchFile(filePath);
}

module.exports = { startLogTailer };
