# JobKit

**A job-application operating system with an LLM agent as its backend.**

JobKit runs your job applications as a version-controlled knowledge base: it tailors your résumé to
each job description, scores keyword coverage, drafts cover letters, preps you for interviews, and
keeps a live pipeline of every company in flight. The twist is the architecture — there's no LLM
API wrapper here. **The backend is the [Claude Code](https://claude.com/claude-code) CLI itself**,
spawned headless on each request to read and write the actual files in the repo.

<!-- Hero screenshot: save the Pipeline or Tailor tab as docs/screenshot.png, then UNCOMMENT the
     line below to show it at the top of the README.
![JobKit — the Pipeline view](docs/screenshot.png)
-->


> **What it demonstrates:** LLM-agent application design (CLI-as-runtime, prompt-programs) ·
> grounding & anti-hallucination for generative output · full-stack shipping (Node/Express, vanilla
> JS, document generation) · a closed learning loop · pragmatic engineering judgment (fast/slow
> split, deterministic scoring over an LLM guess). Designed, built and shipped solo, end to end —
> and used daily to run an actual search.

This is the public **code** repo; it's clone-and-run for anyone (see [Running it](#running-it-your-own-copy)).
The data it operates on — résumés, company notes, pipeline — stays in a separate private repo on
your own machine (see [Two-repo design](#two-repo-design)).

> **Status:** built for one person, running locally — but now clone-and-run for anyone. The
> [Setup tab](#running-it-your-own-copy) onboards you from a pasted CV into your own profile, and it
> runs on *your* Claude account with *your* data (all gitignored, never committed). It's still
> deliberately single-user-per-checkout and un-hardened — read
> [Limitations](#limitations-read-before-you-clone) before cloning.

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

In short: your job applications as a version-controlled, self-improving knowledge base, with
an LLM as the runtime.

---

## Features

Eight tabs, each backed by an endpoint in `server.js`:

| Tab | What it does |
|---|---|
| **Setup** | First-run onboarding. Paste your CV / LinkedIn / career notes → JobKit drafts your `CLAUDE.md` profile (achievement bank, positioning, honesty rules), grounded entirely in what you pasted, with anything it can't confirm flagged for review. |
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

```
Browser (a form)
   │  HTTP
   ▼
Node / Express  ──  fast direct file writes · DOCX/PDF · deterministic ATS math
   │  spawn `claude -p` in the repo dir
   ▼
Claude Code agent  ──reads/writes──▶  CLAUDE.md · companies/ · resumes/ · output/
   │  runs a slash command (.claude/commands/*.md)
   ▼
result rendered back in the UI
```

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

So the engine is shareable and your applications stay private.

---

## Running it (your own copy)

JobKit is built to be cloned and run by anyone, locally, against **their own** Claude account and
**their own** profile. Your data never leaves your machine and is never committed (it's all
gitignored). Setup is three steps:

```bash
npm install
npm start          # → http://localhost:3000
```

1. **Authenticate Claude.** Install the [Claude Code CLI](https://claude.com/claude-code) and make
   sure `claude` runs from your terminal (logged into your own account). Every compute action spawns
   `claude` headless and bills *your* account — there's no shared key.
2. **Onboard.** Open the app; with no profile yet it lands you on the **Setup** tab. Upload your
   résumé (PDF or DOCX) — optionally add comp/location/spelling and any wins not on the CV — and hit
   *Generate my profile*. JobKit extracts the résumé, writes your `CLAUDE.md` (achievement bank,
   positioning, voice and honesty rules) grounded only in what you provided, flagging anything it
   couldn't confirm with `[VERIFY: …]` / `[ADD: …]`, **and saves the uploaded file as your base
   résumé** — so there's no separate step. Review and tighten the profile; this corpus is what every
   other tab reads. (Prefer the terminal? Run `/onboard` there, or copy `CLAUDE.md.template` to
   `CLAUDE.md` and fill it in by hand, then drop a résumé into `resumes/`.)

That's it — Check Match, Tailor, Prep and the rest now work against your profile.

**Prerequisites:** Node (developed on v25; anything modern works) and the Claude Code CLI on your
`PATH`. The data directories (`companies/`, `resumes/`, `output/`) and an empty `pipeline.md` are
created automatically on first boot.

Each LLM-backed action takes ~30s–2min, because a fresh agent loop runs per request.

---

## Limitations (read before you clone)

I'm publishing this as a **portfolio piece and an idea**, not a product. Be clear-eyed:

- **Single-user by design.** No accounts, no auth, no multi-tenancy. It assumes one person,
  one machine, one profile. The way to share it is per-person checkouts — each friend clones,
  onboards their own profile, and runs it on their own Claude account.
- **Runs `--dangerously-skip-permissions`.** The server spawns Claude with file permissions
  bypassed so edits don't prompt. Fine for a private local folder you own; **do not** expose
  this server to a network or run it from a shared directory.
- **No database, no tests, no CI.** State is Markdown + git. That's a feature for a personal
  knowledge base and a liability for anything bigger.
- **Cost & latency live with the agent.** Every compute click is a full Claude Code run —
  slower and pricier than a single API call, and dependent on your local CLI auth.
- **Bring your own profile.** The grounding corpus is personal — yours is generated on the Setup
  tab (or `/onboard`, or `CLAUDE.md.template`) from your own CV and stays on your machine. No
  example profile ships in this repo; the README excerpts only illustrate the *shape* to aim for.
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
.claude/commands/      Slash commands = the agent's business logic (onboard, tailor, prep, log, intake)
CLAUDE.md.template     Blank, structured profile skeleton — copied/filled to create your CLAUDE.md
landing/               Marketing one-pager
```

> `CLAUDE.md`, `companies/`, `resumes/`, `output/` and `pipeline.md` are **gitignored** —
> they're the personal data, kept in the private repo. You supply your own.

---

## License

[PolyForm Noncommercial License 1.0.0](LICENSE.md). Source-available: you're welcome to read,
fork, learn from, and use JobKit for any **noncommercial** purpose. Commercial use is reserved
to the author. If you want to use it commercially, get in touch.

---

*Built by [Yash Kulshreshtha](https://www.linkedin.com/in/yashkul) — an engineering leader based
in Berlin. JobKit is a personal project; all profile and résumé data is generated per-user and kept
private, so nothing personal ships in this repo.*
