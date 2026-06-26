# JobKit

**A job-search operating system that runs on top of Claude Code.**

JobKit turns a folder of Markdown notes into a working application for running a real job
search: tailoring resumes to job descriptions, scoring keyword coverage, prepping for
interviews, and keeping a live pipeline of every company in flight. The interesting part
isn't the UI — it's that **the backend is an LLM agent.** Every "compute" button spawns a
headless [Claude Code](https://claude.com/claude-code) process in the repo, lets it read and
write the actual files, and renders the result.

This is the public **code** repo. The data it operates on (my resumes, company notes,
pipeline) lives in a separate private repo — see [Two-repo design](#two-repo-design) below.

> **Status:** built for one person (me), running locally. It works and I use it daily, but
> it is deliberately single-user and un-hardened. Read [Limitations](#limitations-read-before-you-clone)
> before cloning — you'll probably want to *fork the ideas*, not run it as-is.

---

## The idea

Most "AI resume tools" are a textbox wrapped around a prompt. They're stateless — they don't
know what you applied to last week, what your real achievements are, or which framing got you
a callback. So they hallucinate, and every tailor starts from zero.

JobKit inverts that. **The source of truth is plain Markdown in a git repo:**

- `CLAUDE.md` — a living profile: a verified achievement bank, positioning rules, voice
  rules, an explicit *fabrication log* of phrasings that are off-limits, and a "tailoring
  lessons" section that grows over time.
- `companies/<name>.md` — one file per company, accumulating context (JD, notes, round-by-round prep, process log).
- `pipeline.md` — a single table of where every process stands.

The agent reads these before it does anything, so output is grounded in real facts and
improves as the corpus grows. The headline feature is a **closed learning loop**: every
resume you actually submit is fed back in and diffed two ways — against the achievement bank
(to capture genuinely new facts) and against the machine draft *in the context of that JD*
(to extract generalisable framing lessons). Approved facts and lessons are written back into
`CLAUDE.md`, so **each application makes the next tailor more likely to clear screening.**

In short: a personal job search as a version-controlled, self-improving knowledge base, with
an LLM as the runtime.

---

## Features

Seven tabs, each backed by an endpoint in `server.js`:

| Tab | What it does |
|---|---|
| **Pipeline** | `pipeline.md` rendered as live status cards — every company, stage, and next action in one view. |
| **Companies** | Per-company notes and generated files. Upload your *actually-submitted* resume, mark sent, log entries, close/withdraw, delete. |
| **Check Match** | Paste a JD → fast APPLY/SKIP verdict with reasoning, against an honest fit filter (comp, scope, language, location). Triage before you invest in a full tailor. |
| **Tailor** | Paste a JD → grounded, fully-tailored resume + cover letter + InMail, a deterministic ATS keyword score, and one-click **DOCX / HTML** download. |
| **Prep** | Generate a multi-page interview-prep pack for a specific company and round, built from the real JD ↔ CV gap. |
| **Log** | Two speeds: an instant **Log** button (direct file write, no LLM, <2s) for routine notes, and **AI log** for ambiguous multi-company routing. |
| **Intake** | Bulk-route a pasted blob of notes or a chat summary into the right company files and refresh the pipeline. |

### Things worth calling out

- **Deterministic ATS score (`ats.js`).** Not an LLM guessing a number. It extracts weighted
  keywords from the JD (case-sensitive hard tokens like `C#`, `CI/CD`, `.NET`; multi-word
  phrases; stop-word filtered) and measures coverage in the resume. Same JD + resume → same
  score, every time, with an actionable missing-keyword list. A heuristic, honestly labelled
  as one — not a real ATS engine.
- **Anti-fabrication by construction.** `CLAUDE.md` carries a *fabrication log* of specific
  phrasings the agent must never use, plus honesty rules ("name the gap rather than invent a
  match"). The ATS score is explicitly *not* allowed to justify adding a skill that isn't real.
- **Fast/slow split.** Anything user-facing (file save, mark-sent, pipeline upsert) responds
  in under 2s with a direct file write; the slow LLM steps (context extraction, learning)
  run *after* and update the UI when they finish. The primary action never blocks on AI.
- **Real document output.** Resumes render to DOCX (`docx`) and HTML from the saved Markdown,
  with PDF and DOCX ingestion via `pdf-parse` and `mammoth` for the upload-and-learn loop.

---

## Technical design

### Claude Code as a headless backend

The core architectural bet: instead of calling an LLM API and re-implementing tools (file
read/write, search, document parsing), JobKit uses the **Claude Code CLI as its application
runtime.** The Node server is thin — it owns HTTP, fast direct file writes, document
conversion, and the deterministic ATS math. Everything that needs reasoning is delegated:

```js
// server.js — the whole "AI backend"
const args = ['-p', '--dangerously-skip-permissions', prompt];
const proc = spawn('claude', args, { cwd: ROOT, env: process.env });
```

Each request spawns a fresh `claude -p` (headless, print mode) **in the repo directory**, so
the agent has native access to the files as context and as a workspace. The "business logic"
for tailoring, prepping, intake and logging lives not in JavaScript but as **slash commands**
in `.claude/commands/*.md` — versioned prompt-programs the agent executes:

```
.claude/commands/
  tailor.md          # full tailor pipeline (verdict → CV → cover letter → InMail)
  tailor-analyse.md  # step 1: fast analysis only
  tailor-build.md    # step 2: build full resume after APPLY verdict
  prep.md            # interview prep pack
  log.md / intake.md # process logging + bulk note routing
```

This means the same commands work from the terminal (`/tailor`) and from the web UI — the UI
is just a form that triggers the command. Logic changes are prompt edits, not redeploys.

### Stack

- **Backend:** Node + Express (`server.js`, ~1.2k lines). No framework beyond Express; no DB.
- **Persistence:** the filesystem + git. Markdown *is* the database.
- **AI runtime:** Claude Code CLI, invoked headless per request, using your existing
  `claude` auth session.
- **Frontend:** vanilla HTML/CSS/JS (`public/`) — no build step, no framework. Light theme,
  Plus Jakarta Sans.
- **Documents:** `docx` (generate), `mammoth` (read .docx), `pdf-parse` (read .pdf),
  `marked` (Markdown → HTML).
- **Scoring:** `ats.js`, a self-contained deterministic keyword-coverage module.

### The learning loop, concretely

1. `/tailor` produces a draft resume → download DOCX.
2. You edit it externally (Google Docs / chat) — that edited file is the **source of truth**, not JobKit's draft.
3. Upload the submitted DOCX (`POST /api/upload-sent`): it's saved, text-extracted via
   mammoth, the prior draft is stashed as `_draft.md`, the company is marked sent and
   upserted into the pipeline — all in <2s, no LLM.
4. *Then* `POST /api/extract-context` runs the agent to diff submitted-vs-bank (new facts)
   and submitted-vs-draft-in-context-of-JD (framing lessons).
5. You approve; `add-to-bank` / `add-lessons` write the keepers back into `CLAUDE.md`.

The corpus that grounds the next tailor is strictly better than it was before.

### Two-repo design

One working tree, two git repos:

- **`jobkit`** (this, public) — code, slash commands, landing page. `.gitignore` excludes all
  personal data (`/CLAUDE.md`, `/companies/`, `/output/`, `/resumes/`, `/pipeline.md`).
- **`jobkit-data`** (private) — the actual profile, company files, resumes and pipeline,
  tracked by a separate git dir over the same folder.

So the engine is shareable and the job search stays private.

---

## Running it

```bash
npm install
npm start          # → http://localhost:3000
```

**Prerequisites:**
- Node (developed on v25; anything modern should work).
- The [Claude Code CLI](https://claude.com/claude-code) on your `PATH`, already
  authenticated (`claude` runs from your terminal).
- A `CLAUDE.md` profile + at least one resume in `resumes/`. **These aren't in this repo** —
  the profile and all personal data are gitignored and live in the private data repo. You
  start by writing your own `CLAUDE.md` (achievement bank, voice rules, fabrication log). The
  excerpts in this README show the shape to aim for.

Each LLM-backed action takes ~30s–2min, because a fresh agent loop runs per request.

---

## Limitations (read before you clone)

I'm publishing this as a **portfolio piece and an idea**, not a product. Be clear-eyed:

- **Single-user by design.** No accounts, no auth, no multi-tenancy. It assumes one person,
  one machine, one profile. Two people = two checkouts.
- **Runs `--dangerously-skip-permissions`.** The server spawns Claude with file permissions
  bypassed so edits don't prompt. Fine for a private local folder you own; **do not** expose
  this server to a network or run it from a shared directory.
- **No database, no tests, no CI.** State is Markdown + git. That's a feature for a personal
  knowledge base and a liability for anything bigger.
- **Cost & latency live with the agent.** Every compute click is a full Claude Code run —
  slower and pricier than a single API call, and dependent on your local CLI auth.
- **The profile is mine.** The achievement bank, fabrication log and tailoring lessons in
  `CLAUDE.md` are specific to my career. They're included so you can see the *shape* of a
  good grounding corpus, not so you can apply with them.
- **Heuristics, honestly labelled.** The ATS score is keyword coverage, not a real ATS
  parser. It's reproducible and useful for relative comparison — don't read it as a guarantee.

### If you're here to build on it

The reusable ideas, in rough order of value:

1. **An LLM CLI as a headless app backend** — delegating tools/context to the agent instead
   of re-implementing them.
2. **Prompt-programs as versioned slash commands** — business logic as Markdown, shared
   between terminal and UI.
3. **A grounding corpus with an explicit fabrication log** — how to keep generative output honest.
4. **A closed learning loop** — feeding real-world outcomes back into the corpus so quality compounds.
5. **The fast/slow split** — never block a user action on the model.

To take this multi-user you'd swap the filesystem for a DB, the CLI for the API with
per-tenant context assembly, add auth, sandbox the agent, and cap/meter usage. That's a
different project — which is rather the point of open-sourcing this one.

---

## Repo map

```
server.js              Express server, endpoints, doc generation, Claude spawn helper
ats.js                 Deterministic ATS keyword-coverage scorer
public/                Vanilla JS frontend (index.html, app.js, style.css)
.claude/commands/      Slash commands = the agent's business logic (tailor, prep, log, intake)
landing/               Marketing one-pager
```

> `CLAUDE.md`, `companies/`, `resumes/`, `output/` and `pipeline.md` are **gitignored** —
> they're the personal data, kept in the private repo. You supply your own.

---

*Built by [Yash Kulshreshtha](https://www.linkedin.com/in/yashkul). JobKit is a personal
project; the resume content in this repo is illustrative.*
