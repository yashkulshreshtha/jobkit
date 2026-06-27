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

HARD RULES (override any desire to match the JD — breaking one is a failure, not a near-miss):
1. TITLE LOCK. The job titles in PROFESSIONAL EXPERIENCE are FIXED facts — use them exactly as in
   CLAUDE.md (Delivery Hero = "Engineering Manager / Quality Engineering Manager"; MayTek = "Principal
   Software Consultant"; Atomants = "Head of Technology"). NEVER invent, upgrade, or swap a position
   title to fit the JD (no "Staff Engineer", "Platform EM", "Principal Engineer", etc.). Only the
   headline TITLE LINE at the very top is role-tunable; the titles inside the experience entries are not.
2. NO RELABELLING. Describe each achievement as what it ACTUALLY is — do not recast it as a different
   category of thing to match the JD. The QMI is a quality-metrics / reporting platform; it is NOT an
   "internal developer platform", "Platform-as-a-Product", "CI/CD platform", or "DevEx platform". If the
   JD wants X and I built Y, say Y honestly. Renaming Y into X is fabrication.
3. NO UMBRELLA CLAIMS FROM A PART. If I have one piece of a named framework, name that piece — not the
   umbrella. I have Change Failure Rate (one DORA metric) + a Regression Reliability Index; I do NOT have
   "DORA metrics", "deployment frequency", or "lead time" unless the bank says so.
4. NO INVENTED SCOPE/NUMBERS. Team/service/market figures come from the bank verbatim (17 product teams,
   ~50 services, 30+ teams, 40+ markets). Never manufacture a new figure like "5+ feature teams".
5. A GAP IS REPORTED, NEVER WORN. A JD requirement I don't genuinely meet goes in Step 9 as a gap and
   appears NOWHERE in the profile, competencies, bullets, or skills — not via reframing, relabelling, an
   upgraded title, an umbrella-metric, or a borrowed buzzphrase. ATS/coverage score is never a reason to
   wear a gap. I want to be MYSELF on the page.

STEP 1 — PARSE
Remove any flags from JD text and note which are present.
RESOLVE URL: if the JD argument is a URL (starts with http:// or https://) rather than pasted
text, fetch the page and extract the full job description text (title, company, location,
responsibilities, requirements, benefits) before doing anything else. Use that fetched text as
THE JD for every step below. If the fetch fails (e.g. login wall), stop and say so plainly —
do not proceed with just the URL string as the JD.
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

WORDING RULE (governs the whole draft — read first):
Write as MYSELF. Map my real experience onto what the JD asks for in my own standard terminology.
Do NOT mirror the JD's phrasing, nouns, sentence shapes, or branded buzzphrases — echoing the JD
reads as keyword-stuffing and is a failure, not a success.
THE ONLY MIRRORING ALLOWED: a term that is the genuine, standard INDUSTRY name for something I
actually did — e.g. "CI/CD", "TDD", "test pyramid", "contract testing", "code review", "microservices".
These are shared vocabulary, not the JD's voice, so use them freely where they fit my real work.
A phrase that is the JD's distinctive framing, a vendor/company coinage, or a buzzphrase — e.g.
"Platform-as-a-Product", "developer-productivity tooling", "influence rather than mandate",
"outcomes over tasks", "Internal Developer Platform" — is NOT industry-standard; never adopt it to
match the JD. If unsure whether a term is standard or JD-branded, treat it as JD-branded and use my
own words. Address a JD requirement only when I have genuine matching experience in the base resume,
the bank, or companies/<slug>.md. A requirement I can't honestly match is a gap to report (Step 9),
never a phrase to paste in.

NAME LINE: Yash Kulshreshtha, B.Tech, MSc
CONTACT: Berlin, Germany (German Permanent Resident) · +49 163 171 0329 · yashkulshreshtha@hotmail.com · linkedin.com/in/yashkul
TITLE LINE: role-tuned, e.g. "QA Manager | Quality Engineering Leader | Test Automation"

PROFILE (3–4 lines): Address the JD's top 3 must-haves — but describe the matching real experience
in my own words; do NOT echo the JD's phrasing. Lead with scope + strongest differentiator.

CORE COMPETENCIES: Reorder to lead with what this JD values most, named in my own standard terms
from the base resume — do NOT copy the JD's exact phrases.

PROFESSIONAL EXPERIENCE:
Delivery Hero SE (Feb 2021–Present): 6–8 bullets from the achievement bank only — no invention.
Reorder to lead with most relevant, described in my own wording. Do NOT lift phrases or sentence
shapes from the JD.
BANK COVERAGE RULE: before finalising, scan the WHOLE achievement bank and include every item
genuinely relevant to this JD. Do NOT silently drop a relevant achievement to save space — if the
2-page cap forces a cut, say so in Step 8 and name exactly what was cut and why. The exploratory
testing practice, the QMI/CFR/RRI tooling, and the end-to-end data pipelines are high-value, commonly
relevant items — check them explicitly every time. Every bullet must trace to the base resume,
the achievement bank, or companies/<slug>.md; if it cannot, it is invention — drop it.
Under each role header, include a one-line ITALIC company descriptor, e.g.
*Global online food & grocery delivery platform — operating in 40+ markets.*

NOTE: the DOCX and HTML downloads now render from the saved markdown (Step 7) VERBATIM — nothing in
the markdown is dropped, and nothing outside it appears. So write the saved markdown as the final,
fully formatted resume: `# Name` first, then the title line, then the contact line, then `## Section`
headings, `### Role · Company · dates | location` per role, the italic descriptor, then `- ` bullets.
MayTek (May 2019–Dec 2020): 3–4 bullets, as-is unless a direct JD match exists.
Atomants (Jun 2013–Apr 2019): 3–4 bullets including Red Herring Top 100 Asia 2014.

EDUCATION:
MSc Computer Science — University of Essex, Colchester, UK (2011–2013)
B.Tech Computer Science & Engineering — Amity University, Noida, India (2007–2011)

TECHNICAL SKILLS: Reorder each section to lead with the JD's priority stack. Keep all sections:
Test Automation · Languages & Platforms · CI/CD & DevOps · Test Analytics & Reporting ·
Observability & Cloud · Device & Compatibility · Practices

LANGUAGES & RECOGNITION:
English (fluent), German (working towards B1), Hindi (native)
Red Herring Top 100 Asia Winner (2014) · Published research: 3D stereo fields in VoIP (University of Essex) · Visa: German Permanent Resident

Important: do NOT print the full resume in your response prose. It is saved via RESUME_JSON
and read from file by the UI. Your printed response output should contain only the analysis
(Steps 5 onwards). This keeps the response focused and parseable.

STEP 5 — COVERAGE CHECK (concepts, not verbatim keywords)
List the 8–10 must-have requirements from Step 1 as concepts — not the JD's exact phrases.
For each, check whether the resume already demonstrates that capability through my real experience,
in my own words. Mark each: covered / partial / genuine gap.
Do NOT insert the JD's exact phrasing to raise the score — a concept covered in my own words counts
as covered even when the wording differs from the JD's.
If a capability I genuinely have (base resume / company files) isn't surfaced yet, surface it — in
my words. Never add a capability I don't have to hit a number.
Set ats_score (used by the UI) to the share of requirements genuinely demonstrated, as a percentage.
Report: "Coverage: X/10 requirements demonstrated — ~Y%". Anything not honestly coverable is a gap
for Step 9, not phrasing to paste in.

STEP 6 — QUALITY CHECKS
Quantification: flag any Delivery Hero bullet with no metric. Add one from the
achievement bank if available. Report: "X/Y DH bullets have metrics."
Action verbs: rewrite any bullet starting with: responsible for, worked on, helped,
assisted, involved in, supported. Replace with strong past-tense verbs.
2-page cap: estimate page count at 11pt Arial. If over 2 pages, trim lowest-priority
DH bullets first, then MayTek/Atomants if still over. Note cuts made.

STEP 6B — HONESTY SELF-AUDIT (do this before saving; report PASS/FAIL on each line)
Audit the drafted resume against the HARD RULES and WORDING RULE. Report each:
(a) TITLES — every experience title matches CLAUDE.md exactly (quote them).
(b) TRACE — every profile claim, competency, bullet, and skill traces to a specific bank / base-CV /
    KNOWN_FACTS line. List anything that doesn't, and DELETE it.
(c) RELABEL — no achievement is renamed into a category it isn't (platform / framework / metric type).
(d) MIRROR — no phrase is lifted from the JD unless it's a standard industry term; list any borrowed
    buzzphrases and reword them.
(e) GAP WORN — nothing from Step 9's gap list also appears as if met in the body.
If any check FAILS, fix the draft before Step 7. Never save a resume that fails the audit.

STEP 7 — SAVE AND OUTPUT STRUCTURED DATA
Save the complete final resume as output/resume-<slug>-<YYYYMMDD>.md
Also save the FULL resolved JD text (the fetched text if the input was a URL; the pasted text
otherwise — never just a URL string) as output/<slug>/jd-<YYYYMMDD>.md, with this header:
`# JD — <jd_title> — <slug>` then `_Captured <YYYY-MM-DD>_` then a blank line then the JD text.
This guarantees the JD is persisted on every run (CLI or UI, text or URL). Then emit the marker
`<!-- SAVED_JD: output/<slug>/jd-<YYYYMMDD>.md -->` so the server knows not to overwrite it.

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
Flag explicitly if German proficiency at B1 or above is required or strongly preferred (still working towards B1).

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
