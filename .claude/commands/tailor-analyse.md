---
description: Step 1 of tailor — fast analysis only, no resume build
---
Use CLAUDE.md. Read the relevant companies/<slug>.md if it exists.

JD (text or URL, optionally --cover-letter --research flags):
$ARGUMENTS

Do ONLY these steps — fast, focused, no file writing:

1. Parse JD: title, company slug, EM vs QA lean, location, language requirement,
   8-10 must-have keywords.

2. Fit verdict: APPLY / MAYBE / SKIP with 2 lines of reasoning against the
   apply/skip filter in CLAUDE.md. Be honest. If SKIP, stop here.

3. ATS preview: list the 8-10 must-have keywords. Mark each with a check or
   cross against my profile. Give a rough score. Note genuine gaps.

4. Pick base resume (EM or QA) and say why in one sentence.

Output is short — verdict, keyword table, base pick, gaps. No resume draft yet.

This runs in a non-chat UI — output is displayed, not replied to. State the next step as a fact
("Build the tailored resume from the Tailor tab when ready."), never as a question. Do NOT end by
asking whether to build the resume or what to do next. Never end on a question.

5. As the VERY LAST line, output this machine-readable summary exactly (the UI parses it):
<!-- MATCH: verdict=<APPLY|MAYBE|SKIP> score=<integer 0-100> -->
where score is your overall match score for this role against my profile (consider fit verdict,
keyword/competency overlap, EM-vs-QA lean, location, comp, German requirement, and target tier —
not just the ATS keyword count).
