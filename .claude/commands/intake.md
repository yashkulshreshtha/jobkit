---
description: Ingest pasted notes or chat summary and route into company files + pipeline
---
I'm pasting raw notes — could be rough, could be a summary from another chat. Parse and update the repo.

$ARGUMENTS

Do:
1. Work out which company each piece of information belongs to.
2. Append dated bullets under "## Process log" in companies/<name>.md — create the file from the existing company template if missing.
3. Update Stage / Next action / Contacts where the notes imply a change.
4. Update the matching rows in pipeline.md. Put anything general (strategy, market observations, positioning shifts) under a "## Notes" section in pipeline.md.
5. Summarise in 3–5 lines what changed. Invent nothing not in the notes.
