---
description: Interview prep for a company and round
---
Build a COMPLETE night-before interview prep pack — the kind I read once in full and then re-read
the core. Match the depth of a real prep pack, not a summary: fully written opener scripts, full
STAR stories, comparison tables, trade-offs, gap deep-dives with what-to-read, and an A4 cheat
sheet. This should run several pages. Completeness beats brevity — do NOT truncate stories or
sections to save space, and do not produce a thin one-pager. Where the doc is long, make it
navigable with a tiered "how to use this pack" so I can read the core first and drill deeper as
time allows. "Read twice, not memorise" applies to internalising the opener and stories — it is NOT
a licence to make the doc short.

Plain language throughout: short sentences, real answers I can say out loud, no jargon I wouldn't
use in the room. Ground everything in the documents below — invent nothing, never fabricate
experience to close a gap; name the gap and handle it honestly.

Company + round (e.g. "paymenttools, recruiter round" or "affinidi, system design"):

$ARGUMENTS

## Read everything first — answer only from this
- CLAUDE.md — positioning, achievement bank, voice, comp/notice/leverage rules.
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

## Universal pack — produce these sections for every round

**0. How to use this pack** — a short tiered reading plan by time available (e.g. "2 hours: read
sections X, Y, Z and say the stories aloud · +1 hour: add the gap section · morning of: re-read the
opener and cheat sheet"). Then one line: the single mental model for this interview.

**1. The 90-second opener** — write it out IN FULL in my voice as a quote block, mapped to the top
responsibilities in the JD. Follow with "why this works" (which JD points it hits) and 3–4 delivery
notes (what to emphasise, what to leave for them to ask). This is the one thing to half-memorise.

**2. The frame** — who I am for THIS role in one line; the anchor sentence I return to; one
memorable line I can land if it fits; my superpower vs my one risk for this specific role.

**3. STAR stories to have ready** — pick the 4–6 from the achievement bank that fit this role
(QMI/IDP, CFR/RRI, ~65% AI test-gen, market migrations, scaling to 50, +35% turnaround — only the
true and relevant ones). Write each one FULLY: **Prompt fits** (which questions it answers) ·
**Situation** · **Task** · **Action** (concrete, with the real tools/metrics) · **Result** (numbers)
· **What I'd do differently** · **Why it works for this company**. Lead with the strongest. These
recombine to cover most behavioural questions.

**4. Likely questions — the 10–12 most probable** — cluster by theme (e.g. strategy/vision,
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
JD-vs-CV diff — then ask for the JD. Comp: anchor Berlin EM market ≥ ~€100k or "competitive for
Berlin EM". Never raise notice period unless asked directly.

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
  without it (and the GCP/AWS equivalent if a cloud is named, since I know GCP).
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
