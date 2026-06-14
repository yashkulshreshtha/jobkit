---
description: Step 2 of tailor — build full tailored resume after APPLY verdict
---
Use CLAUDE.md. Read companies/<slug>.md if it exists — especially the Resumes sent
and Fabrication log sections. Read the matching resume PDF from resumes/.

JD (text or URL, optionally --cover-letter --research flags):
$ARGUMENTS

Assume fit has already been confirmed. Do NOT re-run the fit verdict.

FABRICATION GUARD: Read ## Fabrication log in CLAUDE.md. Never use flagged claims.
For any fact not in the achievement bank, write [VERIFY: claim] instead.

STEP 1 — RESEARCH (only if --research flag present)
Web search company engineering culture. Note 2-3 signals. One paragraph only.

STEP 2 — RESUME PERFORMANCE CONTEXT
Read companies/<slug>.md ## Resumes sent. Reason about what framing worked,
what to change. Write 3-5 lines before drafting.

STEP 3 — DRAFT FULL RESUME
Write complete resume per the structure in CLAUDE.md. All sections.
Do NOT print it in response prose — it is saved via RESUME_JSON and read from
file by the UI.

STEP 4 — ATS KEYWORD GATE
Extract 8-10 must-have keywords. Check each against drafted resume.
If below 85%, revise and recheck. Up to 2 retries.
Report: Final ATS score: ~X%

STEP 5 — QUALITY CHECKS
Quantification check, action verb check, 2-page cap. Fix and report each.

STEP 6 — SAVE
Save resume as output/resume-<slug>-<YYYYMMDD>.md

Output RESUME_JSON block, SAVED marker, DIFF_SUMMARY marker, DIFF_DATA block.
Then list gaps honestly.

If --cover-letter flag present: write ~180 words in my voice, save as
output/cover-letter-<slug>-<YYYYMMDD>.md, output SAVED_CL marker.
