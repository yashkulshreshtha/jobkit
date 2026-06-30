---
description: Ingest pasted notes or chat summary and route into company files + pipeline
---
I'm pasting raw notes — could be rough, could be a summary from another chat. Parse and update the repo.

$ARGUMENTS

Do:
1. Work out which company each piece of information belongs to.
2. Append dated bullets under "## Process log" in companies/<name>.md — create the file from the existing company template if missing.
3. Update Stage / Next action / Contacts where the notes imply a change. Use the canonical stage
   labels from the "## Stage vocabulary" section of pipeline.md — do NOT invent new variants for
   the same situation. When the notes say to close a process, use a "Closed — <reason>" label
   (e.g. "Closed — no response"); a rejection before any interview is "Rejected — screening". Use
   ONLY the reason the notes actually state — never add motives, decisions, or framing the notes
   don't contain (e.g. don't write "not pursuing" or "withdrew" unless the user said so).
4. Update the matching rows in pipeline.md. Put anything general (strategy, market observations, positioning shifts) under a "## Notes" section in pipeline.md.
5. Summarise in 3–5 lines what changed. Invent nothing not in the notes.

This runs in a non-chat UI — the output is displayed, not replied to. Do NOT end by asking what to
do next or offering to do more ("Want me to draft…?", "Should I…?", "I can run /prep when you're
ready"). State next steps as facts, not questions — e.g. "Next: confirm the slot to Max by email
(by Sun 28.06)." and "/prep for the Checkmk round is available in the Prep tab." Never end on a
question.
