#!/bin/bash
# PreCompact hook — fires before Claude Code compacts the conversation.
# Non-blocking reminder: this is the moment context is about to shrink,
# so it's the last cheap chance to get state into PROGRESS.md instead of
# losing it to compaction.

echo "Before compacting: confirm PROGRESS.md reflects current Now/Next/Completed state. Update it now if it doesn't." >&2
exit 0
