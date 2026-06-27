---
description: Generate a personal CLAUDE.md profile from pasted career text (CV / LinkedIn / freeform)
---
Set up a new JobKit user. You are turning raw career material into the grounding corpus that every
other command reads: `CLAUDE.md`. Build it from the template structure and ground EVERY fact in the
input — invent nothing.

Career material — usually the extracted text of an uploaded résumé, optionally followed by labelled
blocks. Treat each block per its label:
- `RESUME (...)` — the primary source of truth; mine it for roles, titles, dates, achievements, stack.
- `CONFIRMED PROFILE DETAILS (...)` — facts the user typed directly (e.g. comp, work authorisation,
  spelling). Treat these as confirmed and use them to FILL the matching sections — do NOT leave those
  as `[ADD: …]`.
- `EXTRA CONTEXT / NOTES FROM THE USER` — additional achievements/context to fold in honestly.
If the input is just freeform text with no labels, treat the whole thing as the career material.
$ARGUMENTS

STEP 1 — READ THE STRUCTURE
Read `CLAUDE.md.template` in the repo root. That is the exact section structure, order, and intent to
follow. Your output is a filled-in version of it.

STEP 2 — EXTRACT REAL FACTS (only what's actually in the input)
From the career material, pull:
- Identity: full name, location, work authorisation (if stated), phone, email, LinkedIn, degrees,
  total years of experience, current role + employer + start date.
- Every role: EXACT job title, company, dates, location, and a one-line factual descriptor of the
  employer. Titles are fixed facts — record them verbatim, never upgrade or normalise them.
- Achievements: every concrete, quantified accomplishment — with the real metrics, named systems, and
  tools exactly as stated. These become the achievement bank.
- Stack: languages, platforms/cloud, and other tool categories the person has genuinely used.
- Languages spoken and honest proficiency levels.

STEP 3 — HONESTY GUARD (this is the whole point)
- Use ONLY facts present in the input. Do NOT invent metrics, scope, titles, tools, or employers.
- Where a metric or detail is clearly implied but not stated, write `[VERIFY: <your best guess>]` so
  the person can confirm or correct it — never assert it as fact.
- Where a whole section can't be filled from the input (e.g. target companies, comp range, voice
  preferences, fabrication log), leave the template's guidance and a `[ADD: …]` prompt rather than
  fabricating content. The fabrication log and tailoring lessons start essentially empty — seed the
  fabrication log only with off-limits claims you can infer from the person's real scope (e.g. an
  umbrella term they only partly qualify for), each clearly reasoned.
- Positioning, status/framing, voice and apply/skip filter: propose sensible defaults derived from the
  person's actual field and seniority, but mark anything you're guessing with `[VERIFY: …]`.

STEP 4 — WRITE THE FILE
Write the completed profile to `CLAUDE.md` in the repo root, following the template's headings exactly
(`## Snapshot`, `## Positioning`, `## Status / framing`, `## Professional experience (titles are FIXED
facts)`, `## Achievement bank`, `### Stack`, `## Target companies`, `## Voice rules`, `## Apply / skip
filter`, `## Honesty rules`, `## Fabrication log`, `## Tailoring lessons`). Drop the template's `>`
guidance blockquotes from the final file — keep it clean and readable. Keep the honesty rules section
verbatim from the template; it applies to everyone.

SAFETY: If `CLAUDE.md` already exists and contains real profile content (not just the template
placeholders), do NOT overwrite it. Instead, report what you would add or change and stop — say plainly
that an existing profile is protected and edits should be made by hand or via the Companies/Log flow.

STEP 5 — REPORT (this runs in a non-chat UI — output is displayed, not replied to)
After writing, output:
- One line confirming `CLAUDE.md` was created and roughly how many achievements/roles were captured.
- A short "Review before your first tailor:" list — every `[VERIFY: …]` and `[ADD: …]` you left, so
  the person knows exactly what to confirm. State these as items, not questions.
- One closing line as a fact: "Add a base resume to resumes/ (PDF or DOCX), then use the Tailor tab."
Do NOT end by asking what to do next or offering to do more. Never end on a question.
