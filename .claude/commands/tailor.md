---
description: Tailor a full resume to a JD, quality-gate it, and produce downloadable files
---
Use CLAUDE.md as my context. Read the relevant companies/<slug>.md if it exists — pay
special attention to "## Resumes sent" (what was tried before and how it performed).
Read the matching resume PDF from resumes/ — both were built by Claude so you know
the full structure and can rebuild cleanly.

Arguments: JD text or URL, optionally with --cover-letter and/or --research flags.
$ARGUMENTS

KNOWN FACTS — user-supplied trusted input:
If $ARGUMENTS contains a block delimited by `<<<KNOWN_FACTS` and `KNOWN_FACTS` (it follows a
`--known-facts` flag), everything inside it is asserted true by Yash — facts he knows that are
not yet in the achievement bank. Treat these EXACTLY like the achievement bank: trusted, usable
verbatim or rephrased, NOT subject to the fabrication guard below. Strip this block out of the JD
text before parsing the JD in Step 1. Use these facts wherever they genuinely match the JD.

FABRICATION GUARD — read before doing anything else:
Read CLAUDE.md section "## Fabrication log" if it exists. These are facts previously flagged as
invented. Do NOT use them under any circumstances, even if they would fit the JD well.
When drafting the resume in Step 4: if you are about to use ANY fact, metric, or claim not
explicitly present in the CLAUDE.md achievement bank OR the KNOWN FACTS block above, write
[VERIFY: your intended claim] as a placeholder instead. Do not invent. A placeholder is better
than a fabrication.

STEP 1 — PARSE
Remove any flags from JD text and note which are present.
Extract: role title, company name and slug (lowercase-hyphens, e.g. "trade-republic"),
EM vs QA lean, seniority, location, language requirement (flag if German required),
8–10 must-have keywords, 3–4 nice-to-have keywords. Note today's date (YYYYMMDD).

STEP 2 — RESEARCH (only if --research flag)
Web search "[company] engineering culture [year]" and "[company] tech blog".
Note 2–3 concrete signals (values, stack emphasis, team model) to weave into tone.
One short paragraph only — do not pad.

STEP 3 — RESUME PERFORMANCE CONTEXT
Read companies/<slug>.md and find every entry under "## Resumes sent".
For each entry, extract: date, filename, ATS score, JD title, JD snapshot, outcome.

Then reason explicitly before proceeding:

a) PATTERN: What framing, keywords, and emphasis appeared across sent resumes?
b) SIGNAL: Which outcomes were positive (interview invite)? Which were negative
   (rejection, silence after 3+ weeks)? Which are still pending?
c) IMPLICATION FOR THIS APPLICATION:
   - If a framing worked before for a similar role → reinforce it.
   - If a framing failed for a similar role → change the angle, not just the keywords.
   - If the current JD is meaningfully different from prior ones (seniority, lean, domain)
     → treat it fresh but note the transferable signals.
   - If no history exists → proceed fresh, note this is the first application to this company.

Write 3–5 lines summarising your reasoning before moving to Step 4.
This reasoning directly shapes the emphasis, tone, and bullet ordering in the resume.

STEP 4 — DRAFT FULL RESUME
Write the complete tailored resume. Single-column, ATS-safe structure.

NAME LINE: Yash Kulshreshtha, B.Tech, MSc
CONTACT: Berlin, Germany (German Permanent Resident) · +49 163 171 0329 · yashkulshreshtha@hotmail.com · linkedin.com/in/yashkul
TITLE LINE: role-tuned, e.g. "QA Manager | Quality Engineering Leader | Test Automation"

PROFILE (3–4 lines): Mirror the JD's top 3 must-haves. Lead with scope + strongest differentiator.

CORE COMPETENCIES: Reorder to lead with what this JD values most. Use exact JD keyword phrases where they genuinely match.

PROFESSIONAL EXPERIENCE:
Delivery Hero SE (Feb 2021–Present): 6–8 bullets from the achievement bank only — no invention.
Reorder to lead with most relevant. Use JD keywords naturally.
MayTek (May 2019–Dec 2020): 3–4 bullets, as-is unless a direct JD match exists.
Atomants (Jun 2013–Apr 2019): 3–4 bullets including Red Herring Top 100 Asia 2014.

EDUCATION:
MSc Computer Science — University of Essex, Colchester, UK (2011–2013)
B.Tech Computer Science & Engineering — Amity University, Noida, India (2007–2011)

TECHNICAL SKILLS: Reorder each section to lead with the JD's priority stack. Keep all sections:
Test Automation · Languages & Platforms · CI/CD & DevOps · Test Analytics & Reporting ·
Observability & Cloud · Device & Compatibility · Practices

LANGUAGES & RECOGNITION:
English (fluent), German (A2 – actively progressing), Hindi (native)
Red Herring Top 100 Asia Winner (2014) · Published research: 3D stereo fields in VoIP (University of Essex) · Visa: German Permanent Resident

Important: do NOT print the full resume in your response prose. It is saved via RESUME_JSON
and read from file by the UI. Your printed response output should contain only the analysis
(Steps 5 onwards). This keeps the response focused and parseable.

STEP 5 — ATS KEYWORD GATE
List the 8–10 must-have keywords from Step 1.
Check each against the drafted resume text. Tally matches.
Report: "ATS check: X/10 keywords present — ~Y%"
If score < 85%: identify missing keywords, revise specific bullets/sections to include them
naturally (no stuffing). Recheck. Repeat once more if still below 85%.
If still below after 2 retries: report final honest score and note whether the gap is a
genuine skill gap (acceptable) or just a framing gap (fix it).
Report: "Final ATS score: ~Y%"

STEP 6 — QUALITY CHECKS
Quantification: flag any Delivery Hero bullet with no metric. Add one from the
achievement bank if available. Report: "X/Y DH bullets have metrics."
Action verbs: rewrite any bullet starting with: responsible for, worked on, helped,
assisted, involved in, supported. Replace with strong past-tense verbs.
2-page cap: estimate page count at 11pt Arial. If over 2 pages, trim lowest-priority
DH bullets first, then MayTek/Atomants if still over. Note cuts made.

STEP 7 — SAVE AND OUTPUT STRUCTURED DATA
Save the complete final resume as output/resume-<slug>-<YYYYMMDD>.md

Then output this JSON block exactly between the markers (server uses it to build .docx):

<!-- RESUME_JSON
{
  "slug": "<slug>",
  "date": "<YYYYMMDD>",
  "jd_title": "<role title from JD>",
  "ats_score": <integer 0-100>,
  "jd_text": "<first 800 characters of the JD text, cleaned of newlines>",
  "filename": "resume-<slug>-<YYYYMMDD>",
  "sections": {
    "name": "Yash Kulshreshtha, B.Tech, MSc",
    "contact": "Berlin, Germany (German Permanent Resident) · +49 163 171 0329 · yashkulshreshtha@hotmail.com · linkedin.com/in/yashkul",
    "title": "<tailored title line>",
    "profile": "<profile paragraph as single string>",
    "competencies": ["<item>", "<item>"],
    "experience": [
      {
        "role": "<title>",
        "company": "<company name>",
        "period": "<dates>",
        "location": "<location>",
        "bullets": ["<bullet text>", "<bullet text>"]
      }
    ],
    "education": [
      { "degree": "<degree>", "institution": "<institution>", "period": "<period>" }
    ],
    "technical_skills": {
      "Test Automation": "<comma-separated tools>",
      "Languages & Platforms": "<comma-separated>",
      "CI/CD & DevOps": "<comma-separated>",
      "Test Analytics & Reporting": "<comma-separated>",
      "Observability & Cloud": "<comma-separated>",
      "Device & Compatibility": "<comma-separated>",
      "Practices": "<comma-separated>"
    },
    "languages_recognition": "<full text of this section>"
  }
}
-->

<!-- SAVED: output/resume-<slug>-<YYYYMMDD>.md -->

STEP 8 — DIFF SUMMARY
Output this single line exactly (server parses it):
<!-- DIFF_SUMMARY: added=N modified=M removed=P -->
where N, M, P are the actual counts of bullets added, modified, and removed vs the base resume.
Then output this JSON block for detailed highlighting (best effort):
<!-- DIFF_DATA
{
  "modified_bullets": ["<first 35 chars of each modified bullet>"],
  "added_bullets": ["<first 35 chars of each added bullet>"],
  "removed_bullets": ["<first 35 chars of each removed bullet>"]
}
-->

STEP 9 — GAPS
List JD requirements not clearly met. Honest, not encouraging.
Flag explicitly if German proficiency above A2 is required or strongly preferred.

STEP 10 — COVER LETTER (only if --cover-letter flag)
~180 words in my voice. One specific true reason for this company.
Note I am at Delivery Hero on 3-month notice.
Save as output/cover-letter-<slug>-<YYYYMMDD>.md
Output: <!-- SAVED_CL: output/cover-letter-<slug>-<YYYYMMDD>.md -->

STEP 11 — BANK THE KNOWN FACTS (only if a KNOWN_FACTS block was supplied)
For each user-supplied fact that you actually used in the resume, note it. After the deliverables,
list them under "New facts to bank:" and ask in one line whether to append them to the CLAUDE.md
achievement bank so they're reused next time. Do not append without confirmation. (This is the one
permitted closing question — it exists because banking the fact is the whole point of the feature.)

After completing all steps, end with the deliverables and a one-line summary of what was produced.
Do not end by asking what to do next. If companies/<slug>.md exists, note in one line that /prep is
ready in the Prep tab — as a statement, not a question.
