#!/bin/bash
# PreToolUse hook (Bash matcher) — reminds, non-blocking, when a git commit
# doesn't touch PROGRESS.md. Change `exit 0` to `exit 2` below to hard-block
# instead of warn, if you'd rather enforce this than nudge.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qE 'git commit'; then
  if ! git diff --cached --name-only 2>/dev/null | grep -q '^PROGRESS\.md$' \
     && ! git diff --name-only 2>/dev/null | grep -q '^PROGRESS\.md$'; then
    echo "Reminder: PROGRESS.md hasn't been touched for this commit. If this closes a task or audit, log it before committing." >&2
  fi
fi

exit 0
