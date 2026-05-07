#!/usr/bin/env bash
# Wrap any command and emit Jarvis activity events around it.
#
# Usage:
#   scripts/jarvis-wrap.sh <kind> -- <command...>
#
# Example:
#   scripts/jarvis-wrap.sh test -- npm test
#
# This appends two events to ~/.jarvis/activity.jsonl: one when the
# command starts, and one when it finishes (success or error). It's
# the simplest way to get any AI coding tool to show up in Jarvis
# without modifying the tool itself.
set -euo pipefail

LOG="${JARVIS_LOG:-$HOME/.jarvis/activity.jsonl}"
mkdir -p "$(dirname "$LOG")"

KIND="${1:-command}"
shift || true
if [[ "${1:-}" == "--" ]]; then shift; fi

if [[ $# -eq 0 ]]; then
  echo "usage: jarvis-wrap.sh <kind> -- <command...>" >&2
  exit 64
fi

CMD="$*"
ts() { date +%s%3N; }
emit() {
  local kind="$1"; shift
  local msg="$1"; shift
  printf '{"kind":"%s","timestamp":%s,"message":%s,"command":%s,"source":"jarvis-wrap"}\n' \
    "$kind" "$(ts)" "$(printf '%s' "$msg" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" \
    "$(printf '%s' "$CMD" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" \
    >> "$LOG"
}

emit "$KIND" "Running $CMD"
set +e
"$@"
EXIT=$?
set -e
if [[ $EXIT -eq 0 ]]; then
  emit "success" "Finished $CMD"
else
  emit "error" "Failed $CMD (exit $EXIT)"
fi
exit $EXIT
