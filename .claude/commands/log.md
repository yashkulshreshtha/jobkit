---
description: Log a process update to a company and refresh the pipeline
---
Append a process update. Argument format: "<company> <freeform note about what happened>".

$ARGUMENTS

Do:
1. If companies/<company>.md doesn't exist, create it from the same template as the others.
2. Append a dated bullet under "## Process log" with the note (use today's date).
3. If the note implies a stage or next-action change, update the file's Stage line and the matching row in pipeline.md (Stage, Next action, Updated date).
4. If the note mentions a person, add them under "## Contacts".
5. Confirm in one line what you updated. Don't rewrite unrelated content.
