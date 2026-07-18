---
description: Interview prep for a company and round
---
Build a prep pack that's **lean, plain, and right-sized to the round** — substantial enough that I
walk in confident, short enough that I read it once without fatigue. Every line earns its place: real
answers I can say out loud, no padding, no ornamental framing. This is the opposite of BOTH a thin
one-pager AND a bloated multi-page essay — aim for viable and readable. I can only look at the
interviewer during the call, never at notes, so the pack's job is to prepare my head beforehand, not
to be glanced at live.

**Scale to the round — this matters most:**
- **Recruiter / screen** — keep it SHORT. It's a warm intro, not a grilling. Just: the opener, 3–4
  stories, the handful of questions that actually come up, the real gaps, and my questions for them.
  Drop the optional landscape section; keep the frame and the closing mental-model to a few lines each,
  not full sections. A recruiter pack should be readable in one short sitting.
- **Hiring-manager / panel** — a bit fuller: leadership/strategy depth, more stories, the gap deep-dive.
- **System-design / technical** — use the technical mode below; depth is genuinely the point there.

Right-size, don't stretch or starve: never pad to hit a length, never truncate a real answer to save
space. Where a pack does run long (technical rounds), make it navigable with a tiered "how to use this
pack".

**Plain language, no fancy prose.** Short sentences, real answers I'd actually say in the room. No
ornamental section-dressing ("the identity test of the whole role", "your superpower for this role"),
no jargon I wouldn't use out loud, EU/British spelling. Ground everything in the documents below —
invent nothing, never fabricate experience to close a gap; name the gap and handle it honestly.

Company + round (e.g. "paymenttools, recruiter round" or "affinidi, system design"):

$ARGUMENTS

## Read everything first — answer only from this
- CLAUDE.md — positioning, achievement bank, voice, comp/notice/leverage rules.
- CLAUDE.md `## Interview lessons` — cross-company learnings from PAST interview outcomes/feedback.
  Apply EVERY one of these this round (they are not specific to one company): bake them into the
  delivery notes on the opener (§1), the STAR-story coaching (§3), and the mental model (§8). E.g. a
  past "be more concise / chunk the narrative" lesson means the opener and stories here must be tightened
  and you must add an explicit delivery reminder. These are recurring weak spots — do not let this pack
  repeat the mistake that generated the lesson.
- companies/<name>.md — stage, contacts, prior rounds, JD snapshot, anything learned.
- The full job description if saved at output/<name>/jd-*.md — this is the primary source for the
  §5 JD-vs-CV gap diff. Prefer it over the truncated snapshot in the company file.
- The resume I actually SUBMITTED to this company (output/<name>/): prefer the extracted .md, else
  read the submitted .docx/.pdf directly. This is the source of truth and exactly what the
  interviewer is looking at — answers must match its bullets, metrics and wording. Only if nothing
  was submitted yet, fall back to the matching base resume in resumes/ (EM or QA per role lean).
- The cover letter if one exists — look in output/<name>/ for any file whose name contains "cover"
  (case-insensitive, any extension) and read it. My "why this company" answer must match the reason
  I already gave there.
- Prior prep docs for THIS company at output/<name>/prep-*.md. Be round-aware: from a DIFFERENT
  round reuse only durable stuff (company facts, my frame, gaps, learnings) — never carry another
  round's question-and-answer set into this one. From the SAME round type, go deeper, don't repeat.

## Work out the round type and tailor to it
Identify the round from the input and the company file, then prep what that round actually tests:
- **Recruiter / screen** — story, motivation, logistics, culture fit. No deep tech.
- **Hiring manager** — leadership, delivery, scope, ways of working, strategy, the gap.
- **System design / technical** — architecture, components, trade-offs, flows, depth. Use the
  technical mode below.
- **Panel / values / cross-functional** — collaboration, stakeholder management, influence.
Don't prep question types that won't come up in this round.

## The sections — scale each to the round (keep them tight; a recruiter round trims hard)

**0. How to use this pack** — a short tiered reading plan by time available (e.g. "2 hours: read
sections X, Y, Z and say the stories aloud · +1 hour: add the gap section · morning of: re-read the
opener and cheat sheet"). Then one line: the single mental model for this interview.

**1. The 90-second opener** — write it out IN FULL in my voice as a quote block, mapped to the top
responsibilities in the JD. Follow with "why this works" (which JD points it hits) and 3–4 delivery
notes (what to emphasise, what to leave for them to ask). This is the one thing to half-memorise.

**2. The frame** — who I am for THIS role in one line; the anchor sentence I return to; one
memorable line I can land if it fits; my superpower vs my one risk for this specific role.

**3. STAR stories to have ready** — pick the 4–6 from the achievement bank that fit this role (only the
true and relevant ones; favour the candidate's signature, high-impact achievements). Write each one FULLY: **Prompt fits** (which questions it answers) ·
**Situation** · **Task** · **Action** (concrete, with the real tools/metrics) · **Result** (numbers)
· **What I'd do differently** · **Why it works for this company**. Lead with the strongest. These
recombine to cover most behavioural questions.

**4. Likely questions — only the ones that realistically come up in THIS round** (~6–8 for a recruiter
screen, more for a hiring-manager round) — cluster by theme (e.g. strategy/vision,
technical depth, leadership, domain, logistics, and a "why this company / why now" wildcard). For
each: the question, a 1–3 line answer in my voice, and which STAR story to anchor on. Cover every
question type that realistically comes up in THIS round.

**5. Gaps / risks — deep-dive each** — derive the REAL gaps by diffing the JD against my SUBMITTED
CV: go through the JD's requirements and responsibilities and find each one the CV does not clearly
evidence (a tool/skill I lack, a domain I haven't worked in, a scope/seniority mismatch, a framing
risk like quality-vs-generalist-EM, language). Present them as a short table where useful (JD asks
for X · what my CV shows · how I bridge it). For each gap: explain what it actually is so I
understand it, give an honest framing script as a quote block, and a "what to read this week
(≤1 hour)" list of specific things to skim so I don't look ignorant. Never fabricate to fill a gap —
name it and bridge it honestly. If no JD text is available (not in companies/<name>.md or anywhere),
say so explicitly at the top of this section and flag that the gap analysis is inferred, not a true
JD-vs-CV diff — then ask for the JD. Comp: anchor to the candidate's target/market range as stated in
CLAUDE.md (or "competitive for the market" if none given). Follow CLAUDE.md's rules on notice period and
employment status — never raise notice unless asked directly if CLAUDE.md says so.

When a gap is a specific named tool I lack (e.g. Backstage, Tyk), explain what that tool IS right
there in the gap entry — what it does, why they use it, how it relates to what I've built — so I
actually understand the thing I'm light on. That tool knowledge belongs in the gap, not in a
separate section. End each such gap with the honest stance: "I know what it does and the problem it
solves, I've built the equivalent — the patterns transfer," never claiming hands-on depth I lack.

**5b. (Optional) Other tools & landscape worth knowing** — ONLY for tools/concepts that are relevant
to the role but are NOT already gaps covered in §5 (and not strengths already on my CV). One plain
line each: what it is · why it matters here. Skip this section entirely if everything relevant is
already a gap or a strength — do not pad, and never repeat what §5 already explained.

**6. Questions I ask them** — 4–5 sharp, specific to this company and round; for each, one line on
what it signals or what I learn from the answer.

**7. Logistics & final checklist** — day-before list, day-of list, and the A4 cheat sheet to carry
(story keywords + the questions to ask + one "why them" line + comp anchor). One line on discreetly
using a live process elsewhere as leverage if it helps (never name it).

**8. The mental model for the hour** — the 1–2 things they're really assessing, my superpower, my
one risk, and a final confidence line.

## Technical / system-design mode (use INSTEAD of sections 3–5 when the round is technical)
Teach me to think, not memorise. State the pattern up front and use it for every component:
**WHAT it is (plain) · WHY I pick it here · WHAT BREAKS without it.**
- **Clarify first** — the questions I ask before drawing anything (users, scale, data types,
  read/write ratio, consistency, constraints).
- **Requirements** — functional and non-functional, as a short table (requirement · what it means ·
  design decision and why).
- **Components / services** — a table of each service: what it is · why I pick it · what breaks
  without it (map to the cloud named in the JD, and to the cloud(s) the candidate knows per CLAUDE.md).
- **Architecture** — a box-and-arrow sketch in text or a mermaid diagram, then "why each layer
  exists" (entry, service, storage, support, cross-cutting).
- **Key flows** — the main paths (e.g. write/upload, read/share) step by step; for each step say
  WHAT happens AND WHY. Note auth vs authz as separate steps where relevant.
- **Data model & storage choices** — what goes where and why that store (right tool for the job).
- **Trade-offs & alternatives** — at least one "Approach A vs Approach B" comparison with pros/cons
  and what I'd default to. Plus scaling, failure modes, security (encryption, least-privilege).
- **Likely follow-ups** — the curveballs they throw (large files, hot keys, regional latency,
  revocation) and a crisp answer to each.

End on the mental-model / closer section. Do NOT ask what to do next or offer to expand — this is
the finished pack the server saves for me to download.
