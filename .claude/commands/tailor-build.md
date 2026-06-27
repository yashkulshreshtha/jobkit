---
description: Step 2 of tailor — build full tailored resume after APPLY verdict
---
Use CLAUDE.md. Read companies/<slug>.md if it exists — especially the Resumes sent
and Fabrication log sections. Read the matching resume PDF from resumes/.

JD (text or URL, optionally --cover-letter --research flags):
$ARGUMENTS

Assume fit has already been confirmed. Do NOT re-run the fit verdict.

RESOLVE URL: if the JD above is a URL (starts with http:// or https://) rather than pasted text,
fetch the page and extract the full job description text first, and use that fetched text as THE JD
throughout. If the fetch fails, say so plainly — never proceed with just the URL string as the JD.

FABRICATION GUARD: Read ## Fabrication log in CLAUDE.md. Never use flagged claims.
For any fact not in the achievement bank, write [VERIFY: claim] instead.

LESSONS: Read ## Tailoring lessons in CLAUDE.md (if present) and apply the relevant
rules — these are positioning/framing lessons learned from past submitted resumes,
meant to make this one clear screening. They never override the Fabrication/Honesty rules.

HARD RULES (override any desire to match the JD — breaking one is a failure):
1. TITLE LOCK — experience job titles are fixed facts; use them exactly as in CLAUDE.md (Delivery Hero =
   "Engineering Manager / Quality Engineering Manager"). Never invent/upgrade a title (no "Staff
   Engineer" etc.); only the top headline TITLE LINE is role-tunable.
2. NO RELABELLING — describe each achievement as what it actually is. The QMI is a quality-metrics /
   reporting platform, NOT an "internal developer platform" / "Platform-as-a-Product" / "CI/CD platform".
3. NO UMBRELLA-FROM-A-PART — I have Change Failure Rate (one DORA metric) + a Regression Reliability
   Index; do NOT claim "DORA metrics" / "deployment frequency" unless the bank says so.
4. NO INVENTED SCOPE — team/service/market counts come from the bank verbatim; never manufacture figures.
5. A GAP IS REPORTED, NEVER WORN — an unmet requirement goes in the gaps list only; it appears nowhere in
   the body via reframing, relabelling, an upgraded title, an umbrella-metric, or a borrowed buzzphrase.

STEP 1 — RESEARCH (only if --research flag present)
Web search company engineering culture. Note 2-3 signals. One paragraph only.

STEP 2 — RESUME PERFORMANCE CONTEXT
Read companies/<slug>.md ## Resumes sent. Reason about what framing worked,
what to change. Write 3-5 lines before drafting.

STEP 3 — DRAFT FULL RESUME
Write complete resume per the structure in CLAUDE.md. All sections.
Do NOT print it in response prose — it is saved via RESUME_JSON and read from
file by the UI.

WORDING RULE (governs the whole draft): Write as MYSELF, in my own standard terminology. Do NOT mirror
the JD's phrasing, nouns, sentence shapes, or branded buzzphrases. THE ONLY MIRRORING ALLOWED: a
genuine standard INDUSTRY term for something I actually did (e.g. "CI/CD", "TDD", "test pyramid",
"contract testing"). The JD's distinctive framing / vendor coinages / buzzphrases (e.g.
"Platform-as-a-Product", "developer-productivity tooling", "influence rather than mandate") are NOT
industry-standard — never adopt them. If unsure, treat the term as JD-branded and use my own words.
Address a requirement only when I have genuine matching experience in the base resume, the achievement
bank, or companies/<slug>.md. Unmatched requirements are gaps to report, never phrases to paste in.

Before saving, run a quick HONESTY SELF-AUDIT and report PASS/FAIL: (a) every experience title matches
CLAUDE.md; (b) every claim traces to a real source; (c) no achievement relabelled into a category it
isn't; (d) no JD buzzphrase borrowed; (e) nothing from the gap list worn as if met. Fix before saving.

STEP 4 — COVERAGE CHECK (concepts, not verbatim keywords)
List the 8-10 must-have requirements as concepts, not the JD's exact phrases. For each, check whether
the resume demonstrates that capability through my real experience, in my own words (covered / partial
/ gap). Do NOT insert the JD's phrasing to raise the score; own-words coverage counts. Surface only
capabilities I genuinely have. Set ats_score to the share of requirements genuinely demonstrated.
Report: Coverage: ~X% — and treat anything not honestly coverable as a gap, not phrasing to fix.

STEP 5 — QUALITY CHECKS
Quantification check, action verb check, 2-page cap. Fix and report each.

STEP 6 — SAVE
Save resume as output/resume-<slug>-<YYYYMMDD>.md
Also save the FULL resolved JD text (fetched text if the input was a URL; pasted text otherwise —
never just a URL string) as output/<slug>/jd-<YYYYMMDD>.md, header
`# JD — <jd_title> — <slug>` / `_Captured <YYYY-MM-DD>_` / blank line / JD text. Then emit
`<!-- SAVED_JD: output/<slug>/jd-<YYYYMMDD>.md -->` so the server won't overwrite it.

Output RESUME_JSON block, SAVED marker, SAVED_JD marker, DIFF_SUMMARY marker, DIFF_DATA block.
Then list gaps honestly.

If --cover-letter flag present: write ~180 words in my voice, save as
output/cover-letter-<slug>-<YYYYMMDD>.md, output SAVED_CL marker.

This runs in a non-chat UI — output is displayed, not replied to. End on the deliverables and the
honest gaps. Do NOT end by asking what to do next or offering to do more. Never end on a question.
