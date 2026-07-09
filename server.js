const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, BorderStyle, TabStopType } = require('docx');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { marked } = require('marked');
const { computeAtsScore } = require('./ats');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// --- helpers ---------------------------------------------------------------
function runClaude(prompt, timeoutMs = 480000) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--dangerously-skip-permissions', prompt];
    const proc = spawn('claude', args, { cwd: ROOT, env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('claude timed out after ' + (timeoutMs / 1000) + 's'));
    }, timeoutMs);
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', e => { clearTimeout(timer); reject(e); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || ('claude exited with code ' + code)));
    });
  });
}

// Parse a gate's machine marker, e.g. `<!-- SCREEN: verdict=FIX score=88 domain_zeros=8 -->`.
function parseGateMarker(out, kind) {
  const m = (out || '').match(new RegExp('<!--\\s*' + kind + ':\\s*([^>]*?)-->'));
  if (!m) return null;
  const fields = {};
  m[1].trim().split(/\s+/).forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { const v = p.slice(i + 1); fields[p.slice(0, i)] = /^\d+$/.test(v) ? parseInt(v) : v; }
  });
  return fields;
}

// Run the two quality gates as INDEPENDENT passes — separate `claude -p` invocations, NOT the same
// call that wrote the draft, so the verifier never grades its own writing (the whole point). They run
// in parallel (independent of each other) and may apply their own safe fixes to the saved md. Non-fatal:
// a gate failure or timeout never blocks returning the resume.
async function runResumeGates(slug) {
  const [screenR, verifyR] = await Promise.allSettled([
    runClaude('/tailor-screen ' + slug),
    runClaude('/tailor-verify ' + slug),
  ]);
  const pack = (r, kind) => r.status === 'fulfilled'
    ? (parseGateMarker(r.value, kind) || { verdict: null, note: 'no marker emitted' })
    : { error: r.reason.message };
  return { screen: pack(screenR, 'SCREEN'), verify: pack(verifyR, 'VERIFY') };
}

// Does a log note / stage change look like a learnable OUTCOME or FEEDBACK (vs a routine note)?
const OUTCOME_RE = /\b(reject|declin|unsuccessful|not (moving|proceeding|going) forward|feedback|offer|screened?\s*out|no response|ghosted|passed on|withdrawn|filled internally|advanced|moved to (the )?next|1st interview|first interview|final round)\b/i;
function noteIsOutcome(note, stage) {
  return OUTCOME_RE.test(note || '') || /reject|closed|offer|interview/i.test(stage || '');
}

// Parse the routed-lessons JSON from a /learn run into clean arrays + summary.
function parseLearnOutput(out) {
  const m = (out || '').match(/\{[\s\S]*"interview_lessons"[\s\S]*\}/);
  if (!m) return null;
  let parsed; try { parsed = JSON.parse(m[0]); } catch (e) { return null; }
  const norm = a => Array.isArray(a) ? a.map(x => typeof x === 'string' ? x : (x.lesson || x.text || '')).map(s => s.trim()).filter(Boolean) : [];
  const r = {
    summary: out.slice(0, m.index).trim(),
    interview_lessons: norm(parsed.interview_lessons),
    tailoring_lessons: norm(parsed.tailoring_lessons),
    apply_skip_lessons: norm(parsed.apply_skip_lessons),
  };
  r.total = r.interview_lessons.length + r.tailoring_lessons.length + r.apply_skip_lessons.length;
  return r;
}

// Fire-and-forget: run the learning engine after an outcome is logged and STAGE the proposals to
// output/<company>/pending-lessons.json for review. Never auto-commits to CLAUDE.md, never blocks the log.
async function learnInBackground(company, note) {
  try {
    const out = await runClaude('/learn ' + company + (note ? ' ' + note : ''));
    const r = parseLearnOutput(out);
    if (!r || !r.total) return;   // nothing generalisable — don't stage an empty file
    const dir = path.join(ROOT, 'output', company);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'pending-lessons.json'),
      JSON.stringify({ ...r, generated: new Date().toISOString() }, null, 2));
    console.log('[learn] staged ' + r.total + ' proposal(s) for ' + company + ' (pending approval)');
  } catch (e) { console.error('[learn] background error:', e.message); }
}

// DETERMINISTIC scan of a submitted resume for fabrication-log violations — does NOT rely on the LLM
// (which proved unreliable at catching these even with full visibility, e.g. a resume that writes a raw
// German CEFR level, or reintroduces a banned tech/title). The PERSONAL rules live in a private,
// gitignored config (`fabrication-patterns.json`) so the public code ships only the generic mechanism —
// see `fabrication-patterns.example.json` for the format. Missing/invalid config → no extra checks.
let _fabPatterns = null;
function loadFabPatterns() {
  if (_fabPatterns) return _fabPatterns;
  _fabPatterns = [];
  try {
    const arr = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'fabrication-patterns.json'), 'utf8'));
    if (Array.isArray(arr)) for (const p of arr) {
      try {
        _fabPatterns.push({
          re: new RegExp(p.pattern, p.flags || 'i'),
          unless: p.unless ? new RegExp(p.unless, p.flags || 'i') : null,
          rule: String(p.rule || ''),
          why: String(p.why || ''),
        });
      } catch (e) { console.error('[fab-patterns] skipped a bad rule:', e.message); }
    }
  } catch (e) { /* no config (e.g. a fresh public clone) — generic mechanism, no personal rules */ }
  return _fabPatterns;
}

function scanFabricationConflicts(text) {
  const t = text || '';
  const hits = [];
  for (const p of loadFabPatterns()) {
    if (p.unless && p.unless.test(t)) continue; // negative guard (e.g. "working towards b1" present → ok)
    const m = t.match(p.re);
    if (m) hits.push({ in_resume: m[0].trim().replace(/\s+/g, ' '), rule: p.rule, why: p.why });
  }
  return hits;
}
const dedupeConflicts = arr => {
  const seen = new Set(), out = [];
  for (const c of arr) { const k = (c.in_resume || '').toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(c); } }
  return out;
};

const safeName = n => /^[a-z0-9._-]+$/i.test(n);

// First-run scaffolding: ensure the data directories and an empty pipeline exist so a freshly
// cloned checkout (no personal data — it's all gitignored) boots cleanly for a new user.
const EMPTY_PIPELINE = `# Pipeline — live status

| Company | Role | Tier | Stage | Warm contact | Next action | Updated |
|---------|------|------|-------|--------------|-------------|---------|
`;
async function ensureScaffolding() {
  for (const d of ['output', 'companies', 'resumes']) {
    await fs.mkdir(path.join(ROOT, d), { recursive: true }).catch(() => {});
  }
  try {
    await fs.access(path.join(ROOT, 'pipeline.md'));
  } catch (_) {
    await fs.writeFile(path.join(ROOT, 'pipeline.md'), EMPTY_PIPELINE).catch(() => {});
  }
}
ensureScaffolding();

// Onboarding state: a usable profile exists only when CLAUDE.md is present AND isn't just the
// unfilled template (template still carries <YOUR NAME> / placeholder markers).
async function getSetupStatus() {
  let onboarded = false;
  try {
    const claude = await fs.readFile(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const looksLikeTemplate = claude.includes('<YOUR NAME>') || claude.includes('# Job Search — <');
    onboarded = claude.trim().length > 0 && !looksLikeTemplate;
  } catch (_) { /* no CLAUDE.md → not onboarded */ }
  let hasResume = false;
  try {
    const files = await fs.readdir(path.join(ROOT, 'resumes'));
    hasResume = files.some(f => /\.(pdf|docx)$/i.test(f));
  } catch (_) { /* no resumes dir */ }
  return { onboarded, hasResume };
}

function buildDocx(data) {
  const s = data.sections;
  const NAVY = '1F3A5F';
  const GREY = '555555';

  const rule = (text, before = 220) => new Paragraph({
    spacing: { before, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 2 } },
    children: [new TextRun({ text, bold: true, size: 24, color: NAVY, font: 'Arial' })],
  });

  const b = (t) => new TextRun({ text: t, size: 20, font: 'Arial' });
  const bb = (t) => new TextRun({ text: t, bold: true, size: 20, font: 'Arial' });

  const bul = (text) => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 55 },
    children: [new TextRun({ text, size: 20, font: 'Arial' })],
  });

  const roleHeader = (title, dates) => new Paragraph({
    spacing: { before: 140, after: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
    children: [
      new TextRun({ text: title, bold: true, size: 21, font: 'Arial' }),
      new TextRun({ text: '\t' + dates, size: 20, color: GREY, font: 'Arial' }),
    ],
  });

  const subLine = (company, loc) => new Paragraph({
    spacing: { after: 55 },
    children: [
      new TextRun({ text: company, italics: true, size: 20, color: NAVY, font: 'Arial' }),
      new TextRun({ text: '  |  ' + loc, italics: true, size: 20, color: GREY, font: 'Arial' }),
    ],
  });

  const paras = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: s.name, bold: true, size: 38, color: NAVY, font: 'Arial' })] }),
    new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: s.title, size: 22, color: GREY, font: 'Arial' })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: s.contact, size: 18, color: GREY, font: 'Arial' })] }),
    rule('PROFILE', 200),
    new Paragraph({ spacing: { after: 40 }, children: [b(s.profile)] }),
  ];

  if ((s.skills_stack || []).length) {
    paras.push(rule('SKILLS & STACK'));
    s.skills_stack.forEach(group => {
      paras.push(new Paragraph({
        spacing: { before: 100, after: 30 },
        children: [new TextRun({ text: group.heading, bold: true, size: 20, font: 'Arial' })],
      }));
      (group.bullets || []).forEach(bullet => paras.push(bul(bullet)));
    });
  } else {
    paras.push(rule('CORE COMPETENCIES'));
    const comps = s.competencies || [];
    for (let i = 0; i < comps.length; i += 2) {
      const left = comps[i] || '';
      const right = comps[i + 1] || '';
      paras.push(new Paragraph({
        spacing: { after: 40 },
        tabStops: [{ type: TabStopType.LEFT, position: 4500 }],
        children: [
          new TextRun({ text: '● ' + left, size: 20, font: 'Arial' }),
          right ? new TextRun({ text: '\t● ' + right, size: 20, font: 'Arial' }) : new TextRun({ text: '' }),
        ],
      }));
    }
  }

  paras.push(rule('PROFESSIONAL EXPERIENCE'));

  (s.experience || []).forEach(exp => {
    paras.push(roleHeader(exp.role, exp.period));
    paras.push(subLine(exp.company, exp.location));
    (exp.bullets || []).forEach(bullet => paras.push(bul(bullet)));
  });

  paras.push(rule('EDUCATION'));
  (s.education || []).forEach(ed => {
    paras.push(new Paragraph({
      spacing: { after: 30 },
      children: [bb(ed.degree), b(' — ' + ed.institution + ' (' + ed.period + ')')],
    }));
  });

  const ts = s.technical_skills || {};
  if (Object.keys(ts).length) {
    paras.push(rule('TECHNICAL SKILLS'));
    Object.entries(ts).forEach(([cat, val]) => {
      paras.push(new Paragraph({
        spacing: { after: 30 },
        children: [bb(cat + ': '), b(val)],
      }));
    });
  }

  if (s.languages_recognition) {
    paras.push(rule('LANGUAGES & RECOGNITION'));
    s.languages_recognition.split('\n').filter(Boolean).forEach(line => {
      paras.push(new Paragraph({ spacing: { after: 30 }, children: [b(line)] }));
    });
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 200 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children: paras,
    }],
  });

  return Packer.toBuffer(doc);
}

function buildPrintHtml(data) {
  const s = data.sections;
  const expHtml = (s.experience || []).map(exp => `
    <div class="role-header"><span class="role-title">${exp.role}</span><span class="role-dates">${exp.period}</span></div>
    <div class="role-sub">${exp.company}${exp.location ? ' | ' + exp.location : ''}</div>
    <ul>${(exp.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
  `).join('');

  const eduHtml = (s.education || []).map(e =>
    `<p><strong>${e.degree}</strong> — ${e.institution} (${e.period})</p>`).join('');

  let skillsHtml = '';
  if ((s.skills_stack || []).length) {
    skillsHtml = `<div class="section-heading">Skills &amp; Stack</div>
${s.skills_stack.map(g => `<p><strong>${g.heading}</strong></p><ul>${(g.bullets||[]).map(b=>`<li>${b}</li>`).join('')}</ul>`).join('\n')}`;
  } else if ((s.competencies||[]).length) {
    skillsHtml = `<div class="section-heading">Core Competencies</div><ul>${s.competencies.map(c=>`<li>${c}</li>`).join('')}</ul>`;
  }

  const tsEntries = Object.entries(s.technical_skills || {});
  const tsHtml = tsEntries.length && !(s.skills_stack||[]).length
    ? `<div class="section-heading">Technical Skills</div>${tsEntries.map(([k,v])=>`<p><strong>${k}:</strong> ${v}</p>`).join('')}`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${s.name} — Resume</title>
<style>
body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4;max-width:800px;margin:32px auto;color:#111}
@media print{body{margin:0;max-width:100%}@page{margin:18mm}}
h1{font-size:20pt;color:#1F3A5F;margin:0 0 4px}
.title-line{color:#555;font-size:12pt;margin:0 0 4px}
.contact{color:#555;font-size:9pt;margin:0 0 16px}
.section-heading{font-size:11pt;font-weight:bold;color:#1F3A5F;border-bottom:1.5px solid #1F3A5F;margin:14px 0 6px;padding-bottom:2px;text-transform:uppercase;letter-spacing:.5px}
.role-header{display:flex;justify-content:space-between;font-weight:bold;font-size:10.5pt;margin-top:10px}
.role-sub{color:#1F3A5F;font-style:italic;font-size:10pt;margin-bottom:4px}
ul{margin:4px 0;padding-left:18px}li{margin:3px 0}
p{margin:4px 0}
</style></head><body>
<h1>${s.name}</h1>
<div class="title-line">${s.title}</div>
<div class="contact">${s.contact}</div>
<div class="section-heading">Profile</div>
<p>${s.profile}</p>
${skillsHtml}
<div class="section-heading">Professional Experience</div>
${expHtml}
<div class="section-heading">Education</div>${eduHtml}
${tsHtml}
<div class="section-heading">Languages &amp; Recognition</div>
<p>${(s.languages_recognition||'').replace(/\n/g,'<br>')}</p>
</body></html>`;
}

// --- lossless markdown → downloads (single source of truth) -----------------
// The saved resume markdown is rendered verbatim into both DOCX and HTML so the
// downloads match the UI preview word-for-word (preview = marked.parse(md) too).

// Maps marked inline tokens → docx TextRuns (bold/italic/links/code preserved).
function mdInlineRuns(nodes, opts = {}) {
  const out = [];
  const base = { font: 'Arial', size: opts.size || 20, color: opts.color };
  const walk = (arr, bold, ital) => (arr || []).forEach(n => {
    if (n.type === 'strong') return walk(n.tokens, true, ital);
    if (n.type === 'em')     return walk(n.tokens, bold, true);
    if (n.type === 'link')   return walk(n.tokens, bold, ital);
    if (n.type === 'br')     return out.push(new TextRun({ break: 1 }));
    if (n.type === 'codespan') return out.push(new TextRun({ ...base, text: n.text, font: 'Courier New' }));
    out.push(new TextRun({ ...base, text: (n.text != null ? n.text : n.raw) || '',
      bold: bold || opts.bold || false, italics: ital || opts.italics || false }));
  });
  walk(nodes, opts.bold, opts.italics);
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}

// DOCX rendered straight from the markdown — renders EVERY block, nothing skipped.
function mdToDocx(md) {
  const NAVY = '1F3A5F';
  const paras = [];
  marked.lexer(md || '').forEach(tok => {
    if (tok.type === 'heading') {
      if (tok.depth === 1) paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
        children: mdInlineRuns(tok.tokens, { bold: true, size: 40, color: NAVY }) }));
      else if (tok.depth === 2) paras.push(new Paragraph({ spacing: { before: 200, after: 70 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 2 } },
        children: mdInlineRuns(tok.tokens, { bold: true, size: 21, color: NAVY }) }));
      else paras.push(new Paragraph({ spacing: { before: 140, after: 20 },
        children: mdInlineRuns(tok.tokens, { bold: true, size: 21 }) }));
    } else if (tok.type === 'paragraph') {
      paras.push(new Paragraph({ spacing: { after: 60 }, children: mdInlineRuns(tok.tokens, {}) }));
    } else if (tok.type === 'list') {
      tok.items.forEach(item => {
        const inline = (item.tokens || []).flatMap(t => t.tokens || [{ type: 'text', text: t.text || '' }]);
        paras.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 40 },
          children: mdInlineRuns(inline, {}) }));
      });
    } else if (tok.raw && tok.raw.trim() && tok.type !== 'hr' && tok.type !== 'space') {
      paras.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: tok.raw.trim(), font: 'Arial', size: 20 })] }));
    }
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
      alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 200 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 },
      margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } }, children: paras }],
  });
  return Packer.toBuffer(doc);
}

// HTML rendered straight from the markdown (same parser as the UI preview → identical content).
function mdToHtml(md) {
  const body = marked.parse(md || '', { async: false });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resume</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;max-width:820px;margin:28px auto;color:#1a1a1a;padding:0 22px}
@media print{body{margin:0;max-width:100%}@page{size:A4;margin:15mm}}
h1{font-size:20pt;color:#1F3A5F;text-align:center;margin:0 0 2px}
h1 + p{text-align:center;color:#555;margin:0 0 2px}
h2{font-size:11pt;color:#1F3A5F;text-transform:uppercase;letter-spacing:.5px;border-bottom:1.4px solid #1F3A5F;padding-bottom:2px;margin:16px 0 7px}
h3{font-size:10.5pt;margin:11px 0 1px}
em{color:#444}p{margin:4px 0}ul{margin:4px 0;padding-left:20px}li{margin:3px 0}a{color:#1F3A5F;text-decoration:none}
</style></head><body>
${body}
</body></html>`;
}

function serverParseMd(md) {
  const lines = md.split('\n');
  let i = 0;
  let name = '', title = '', contact = '';

  while (i < lines.length && lines[i].trim() !== '---') {
    const l = lines[i].trim();
    if (l.startsWith('# '))       { name = l.slice(2).trim(); i++; continue; }
    if (l.startsWith('## '))      { title = l.slice(3).trim(); i++; continue; }
    const bm = l.match(/^\*\*(.+)\*\*$/);
    const text = bm ? bm[1] : l;
    if (!text) { i++; continue; }
    if (!title) title = text;
    else if (!contact && (text.includes('@') || /\+\d/.test(text) || text.toLowerCase().includes('linkedin'))) contact = text;
    i++;
  }
  i++;

  let profile = '', competencies = [], skills_stack = [], experience = [], education = [], technical_skills = {}, languages_recognition = '';
  const sec = l => l.replace(/^##\s+/, '').trim().toLowerCase();

  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '---') { i++; continue; }
    if (!l.startsWith('## ')) { i++; continue; }
    const s = sec(l);

    if (s === 'profile') {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') buf.push(lines[i++]);
      profile = buf.join('\n').trim();
      continue;
    }

    if (s === 'core competencies') {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') {
        const cl = lines[i++].trim();
        if (cl.startsWith('- ')) competencies.push(cl.slice(2).trim());
      }
      continue;
    }

    if (s === 'skills & stack') {
      i++;
      let group = null;
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') {
        const sl = lines[i].trim();
        const bm = sl.match(/^\*\*(.+?)\*\*$/);
        if (bm) { group = { heading: bm[1], bullets: [] }; skills_stack.push(group); }
        else if (sl.startsWith('- ') && group) group.bullets.push(sl.slice(2).trim());
        i++;
      }
      continue;
    }

    if (s === 'professional experience' || s === 'experience') {
      i++;
      while (i < lines.length) {
        const el = lines[i].trim();
        if (el.startsWith('## ')) break;
        if (el === '---') { i++; break; }
        if (el.startsWith('### ')) {
          const header = el.slice(4).trim();
          const parts = header.split(' · ');
          let role = header, company = '', period = '', location = '';
          if (parts.length >= 3) {
            role = parts[0].trim(); company = parts[1].trim();
            const rest = parts.slice(2).join(' · ');
            const pipeIdx = rest.indexOf(' | ');
            if (pipeIdx >= 0) { period = rest.slice(0, pipeIdx).trim(); location = rest.slice(pipeIdx + 3).trim(); }
            else period = rest.trim();
          } else if (parts.length === 2) {
            role = parts[0].trim(); company = parts[1].trim();
          }
          let bullets = [];
          i++;
          while (i < lines.length) {
            const rl = lines[i].trim();
            if (rl.startsWith('## ') || rl.startsWith('### ')) break;
            if (rl === '---') { i++; break; }
            const boldLine = rl.match(/^\*\*(.+?)\*\*\s*\|\s*(.+)$/);
            if (boldLine) {
              period = boldLine[2].trim();
              if (!company) {
                const di = boldLine[1].indexOf(' — ');
                if (di >= 0) { company = boldLine[1].slice(0, di).trim(); location = boldLine[1].slice(di + 3).trim(); }
                else company = boldLine[1];
              }
              i++; continue;
            }
            if (/^\*[^*]/.test(rl) && rl.endsWith('*')) { i++; continue; }
            if (rl.startsWith('- ')) bullets.push(rl.slice(2).trim());
            i++;
          }
          experience.push({ role, company, location, period, bullets });
          continue;
        }
        i++;
      }
      continue;
    }

    if (s === 'education') {
      i++;
      const edus = [];
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') {
        const el = lines[i++].trim();
        const m = el.match(/^\*\*(.+?)\*\*\s*[—\-]\s*(.+?)\s*\((.+?)\)$/);
        if (m) edus.push({ degree: m[1].trim(), institution: m[2].trim(), period: m[3].trim() });
      }
      education = edus;
      continue;
    }

    if (s === 'technical skills') {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') {
        const tl = lines[i++].trim();
        const m = tl.match(/^\*\*(.+?):\*\*\s*(.+)$/);
        if (m) technical_skills[m[1].trim()] = m[2].trim();
      }
      continue;
    }

    if (s === 'languages & recognition') {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') buf.push(lines[i++]);
      languages_recognition = buf.join('\n').trim();
      continue;
    }

    i++;
    while (i < lines.length && !lines[i].trim().startsWith('##') && lines[i].trim() !== '---') i++;
  }

  return { name, title, contact, profile, competencies, skills_stack, experience, education, technical_skills, languages_recognition };
}

// Extract plain text from a DOCX/PDF buffer. Used by both upload-sent (at save time)
// and extract-context (on-the-fly fallback for resumes uploaded before PDF support).
async function extractResumeText(buf, ext) {
  if (ext === 'docx') {
    const r = await mammoth.extractRawText({ buffer: buf });
    return (r.value || '').trim();
  }
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buf });
    try { const r = await parser.getText(); return (r.text || '').trim(); }
    finally { await parser.destroy().catch(() => {}); }
  }
  return '';
}

// Text of the base resumes (em + qa), cached for the process lifetime — they change
// rarely. Used by Check Match to score a JD against your off-the-shelf material with
// the SAME deterministic engine the Tailor tab uses on the tailored draft, so the two
// tabs report the same kind of number (baseline coverage vs tailored coverage).
let _baseResumeTextCache = null;
async function getBaseResumeText() {
  if (_baseResumeTextCache != null) return _baseResumeTextCache;
  const parts = [];
  for (const f of ['resume-em.pdf', 'resume-qa.pdf']) {
    try {
      const buf = await fs.readFile(path.join(ROOT, 'resumes', f));
      parts.push(await extractResumeText(buf, 'pdf'));
    } catch (_) { /* base resume missing → skip it */ }
  }
  _baseResumeTextCache = parts.join('\n');
  return _baseResumeTextCache;
}

function upsertPipelineRow(pipelineContent, name, role, stage, today) {
  // On an existing row, sync role + stage + the "Updated" date. This is what keeps a
  // second application to the SAME company from leaving a stale role behind: when the
  // current application changes (e.g. Operations Lead -> Engineering Manager), the row
  // now reflects the new role, not just the new stage. Presence is checked explicitly —
  // NOT by diffing the update result — because a same-values re-submit is a no-op update
  // and must still count as "found" (otherwise it would insert a duplicate row).
  if (pipelineHasRow(pipelineContent, name)) {
    return updatePipelineRow(pipelineContent, name, { role, stage, updated: today });
  }

  // company not in pipeline — add a new row.
  // Pipe chars in a value would break the markdown table columns (e.g. German
  // gender tags like "(m|w|d)"), so collapse them to "/" before inserting.
  const cell = v => String(v).replace(/\|/g, '/').trim();
  const lines = pipelineContent.split('\n');
  const nameDisplay = cell(name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const newRow = `| ${nameDisplay} | ${role ? cell(role) : '—'} | — | ${cell(stage)} | — | — | ${today} |`;
  let lastTableIdx = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('|') && !/^\|[-\s:|]+\|/.test(l)) lastTableIdx = i;
  });
  if (lastTableIdx >= 0) lines.splice(lastTableIdx + 1, 0, newRow);
  else lines.push(newRow);
  return lines.join('\n');
}

// True if the pipeline table already has a row for this company (substring match on the
// Company cell). Used to decide insert-vs-update without relying on a content diff.
function pipelineHasRow(pipelineContent, name) {
  const nameVariant = name.replace(/-/g, ' ').toLowerCase();
  const pLines = pipelineContent.split('\n');
  const headerLine = pLines.find(l => l.startsWith('|') && !/^\|[-\s:|]+\|/.test(l) && l.toLowerCase().includes('stage'));
  let companyColIdx = -1;
  if (headerLine) companyColIdx = headerLine.split('|').findIndex(c => c.trim().toLowerCase() === 'company');
  return pLines.some(line => {
    if (!line.startsWith('|') || /^\|[-\s:|]+\|/.test(line)) return false;
    const cols = line.split('|');
    const colToCheck = companyColIdx >= 0 ? (cols[companyColIdx] || '') : (cols[1] || '');
    return colToCheck.trim().toLowerCase().includes(nameVariant);
  });
}

// Update any subset of the role / stage / updated cells on an existing company row.
// Returns the content unchanged if the company isn't in the table. Keyed by a
// substring match on the Company cell (same convention as the old updatePipelineStage).
function updatePipelineRow(pipelineContent, name, { role, stage, updated } = {}) {
  const pLines = pipelineContent.split('\n');
  const headerLine = pLines.find(l => l.startsWith('|') && !/^\|[-\s:|]+\|/.test(l) && l.toLowerCase().includes('stage'));
  let companyColIdx = -1, roleColIdx = -1, stageColIdx = -1, updatedColIdx = -1;
  if (headerLine) {
    const hCols = headerLine.split('|');
    companyColIdx = hCols.findIndex(c => c.trim().toLowerCase() === 'company');
    roleColIdx    = hCols.findIndex(c => c.trim().toLowerCase() === 'role');
    stageColIdx   = hCols.findIndex(c => c.trim().toLowerCase() === 'stage');
    updatedColIdx = hCols.findIndex(c => c.trim().toLowerCase() === 'updated');
  }
  const cell = v => String(v).replace(/\|/g, '/').trim();
  const nameVariant = name.replace(/-/g, ' ').toLowerCase();
  return pLines.map(line => {
    if (!line.startsWith('|') || /^\|[-\s:|]+\|/.test(line)) return line;
    const cols = line.split('|');
    const colToCheck = companyColIdx >= 0 ? (cols[companyColIdx] || '') : (cols[1] || '');
    if (!colToCheck.trim().toLowerCase().includes(nameVariant)) return line;
    if (stage   != null && stageColIdx   >= 0) cols[stageColIdx]   = ' ' + cell(stage) + ' ';
    if (role    != null && roleColIdx    >= 0) cols[roleColIdx]    = ' ' + cell(role) + ' ';
    if (updated != null && updatedColIdx >= 0) cols[updatedColIdx] = ' ' + cell(updated) + ' ';
    return cols.join('|');
  }).join('\n');
}

// Back-compat shim: stage-only update (used by the tailor-stub presence probe and /close).
function updatePipelineStage(pipelineContent, name, newStage) {
  return updatePipelineRow(pipelineContent, name, { stage: newStage });
}

// Maintain the "## Applications" history inside a company file and sync the top-level
// Stage / Role / Resume-used to the current (latest) application. Applications are keyed
// by DATE: re-recording the same date updates that entry; a new date inserts a fresh
// block at the top. This is what lets one company hold several applications without the
// single-valued header fields going stale or ambiguous.
function recordApplication(content, opts) {
  const date  = opts.date;
  const role  = (opts.role  || 'Role').trim();
  const stage = (opts.stage || 'Submitted').trim();

  // Seed a header if the file is new/empty and we know the company — so the top-level
  // fields below have an H1 to anchor under (register-as-sent on a company with no file).
  if (opts.company && !/^#\s+/m.test(content)) {
    const title = opts.company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    content = `# ${title}\n\n${content.replace(/^\n+/, '')}`;
  }

  const atsVal = (opts.ats == null || opts.ats === '') ? ''
    : (opts.ats === '?' ? '?' : String(opts.ats).replace(/%$/, '') + '%');
  const fields = [];
  if (opts.resume) fields.push(`- Resume: ${opts.resume}`);
  if (opts.jd)     fields.push(`- JD: ${opts.jd}`);
  if (atsVal)      fields.push(`- ATS: ${atsVal}`);
  fields.push(`- Outcome: ${opts.outcome || 'pending'}`);
  const newBlockLines = [`### ${date} — ${role} — ${stage}`, ...fields];

  let lines = content.split('\n');

  // ensure an "## Applications" section exists (before Process log if present)
  let appIdx = lines.findIndex(l => /^##\s+Applications\s*$/.test(l));
  if (appIdx === -1) {
    const procIdx = lines.findIndex(l => /^##\s+Process log/i.test(l));
    if (procIdx === -1) { lines.push('', '## Applications', ''); appIdx = lines.length - 2; }
    else { lines.splice(procIdx, 0, '## Applications', '', ''); appIdx = procIdx; }
  }

  // section body runs from just after the heading to the next "## "
  let end = lines.length;
  for (let i = appIdx + 1; i < lines.length; i++) { if (/^##\s+/.test(lines[i])) { end = i; break; } }
  let body = lines.slice(appIdx + 1, end);

  const blockStarts = [];
  body.forEach((l, i) => { if (/^###\s+/.test(l)) blockStarts.push(i); });
  const dateOf = header => (header.replace(/^###\s+/, '').split(' — ')[0] || '').trim();

  let replaced = false;
  for (let b = 0; b < blockStarts.length; b++) {
    const start = blockStarts[b];
    const bEnd  = (b + 1 < blockStarts.length) ? blockStarts[b + 1] : body.length;
    if (dateOf(body[start]) === date) {
      // trim trailing blanks that belonged to the old block, keep one separator
      let sliceEnd = bEnd;
      while (sliceEnd > start + 1 && body[sliceEnd - 1].trim() === '') sliceEnd--;
      body.splice(start, sliceEnd - start, ...newBlockLines);
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    let insertPos = 0;
    while (insertPos < body.length && body[insertPos].trim() === '') insertPos++;
    body.splice(insertPos, 0, ...newBlockLines, '');
  }

  lines = [...lines.slice(0, appIdx + 1), ...body, ...lines.slice(end)];
  content = lines.join('\n');

  // sync top-level fields (replace in place, else insert after the given anchor, else
  // after the H1, else at the very top — so even a header-less file gets valid top matter).
  const setField = (c, key, val, afterRe) => {
    const lineRe = new RegExp(`^- ${key}:.*$`, 'm');
    if (lineRe.test(c)) return c.replace(lineRe, `- ${key}: ${val}`);
    if (afterRe && afterRe.test(c)) return c.replace(afterRe, m => `${m}\n- ${key}: ${val}`);
    if (/^#[^\n]*\n/.test(c)) return c.replace(/^(#[^\n]*\n)/, `$1\n- ${key}: ${val}\n`);
    return `- ${key}: ${val}\n` + c;
  };
  content = setField(content, 'Stage', stage, null);
  content = setField(content, 'Role', role, /^- Stage:.*$/m);
  if (opts.resume) content = setField(content, 'Resume used', opts.resume, /^- Role:.*$/m);
  return content;
}

// Mark the current (top-most) application block Closed/rejected and set its Outcome,
// so a company's history reflects the real result of its latest application.
function closeCurrentApplication(content, stage, outcome) {
  const lines = content.split('\n');
  const appIdx = lines.findIndex(l => /^##\s+Applications\s*$/.test(l));
  if (appIdx === -1) return content;
  let end = lines.length;
  for (let i = appIdx + 1; i < lines.length; i++) { if (/^##\s+/.test(lines[i])) { end = i; break; } }
  const startRel = lines.slice(appIdx + 1, end).findIndex(l => /^###\s+/.test(l));
  if (startRel === -1) return content;
  const hIdx = appIdx + 1 + startRel;
  // header: "### <date> — <role> — <stage>" → replace the stage segment
  const parts = lines[hIdx].replace(/^###\s+/, '').split(' — ');
  if (parts.length >= 2) { parts[parts.length - 1] = stage; lines[hIdx] = '### ' + parts.join(' — '); }
  // update this block's Outcome line (up to the next block/section)
  let blockEnd = end;
  for (let i = hIdx + 1; i < end; i++) { if (/^###\s+/.test(lines[i])) { blockEnd = i; break; } }
  let touched = false;
  for (let i = hIdx + 1; i < blockEnd; i++) {
    if (/^- Outcome:/.test(lines[i])) { lines[i] = `- Outcome: ${outcome}`; touched = true; break; }
  }
  if (!touched) lines.splice(blockEnd, 0, `- Outcome: ${outcome}`);
  return lines.join('\n');
}

// Best-effort "date applied" for a company, read from its companies/<slug>.md.
// Prefers the earliest date in the "Resumes sent" section, then any resume-sent /
// submitted log line, then the earliest date anywhere in the file.
function extractAppliedDate(md) {
  const dateRe = /\b(20\d{2}-\d{2}-\d{2})\b/g;
  const earliest = text => {
    const ds = (text.match(dateRe) || []).sort();
    return ds.length ? ds[0] : null;
  };
  const lines = md.split('\n');
  const idx = lines.findIndex(l => /^#+\s*resumes?\s+sent/i.test(l.trim()));
  if (idx !== -1) {
    const section = [];
    for (let i = idx + 1; i < lines.length && !/^#+\s/.test(lines[i]); i++) section.push(lines[i]);
    const d = earliest(section.join('\n'));
    if (d) return d;
  }
  const sentLines = lines.filter(l => /resume\s+(sent|submitted)|\bsubmitted\b|\bapplied\b/i.test(l));
  const d2 = earliest(sentLines.join('\n'));
  if (d2) return d2;
  return earliest(md);
}

// --- read-only views -------------------------------------------------------
app.get('/api/pipeline', async (req, res) => {
  try {
    const content = await fs.readFile(path.join(ROOT, 'pipeline.md'), 'utf8');
    const appliedDates = {};
    try {
      const dir = path.join(ROOT, 'companies');
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.md'));
      for (const f of files) {
        try {
          const d = extractAppliedDate(await fs.readFile(path.join(dir, f), 'utf8'));
          if (d) appliedDates[f.replace(/\.md$/, '')] = d;
        } catch (_) { /* skip unreadable company file */ }
      }
    } catch (_) { /* no companies dir → empty map */ }
    res.json({ content, appliedDates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/companies', async (req, res) => {
  try {
    const dir = path.join(ROOT, 'companies');
    const files = await fs.readdir(dir);
    const names = files.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort();
    res.json({ names });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/companies/:name', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  try {
    const content = await fs.readFile(path.join(ROOT, 'companies', req.params.name + '.md'), 'utf8');
    res.json({ content });
  } catch (e) { res.status(404).json({ error: 'not found' }); }
});

app.put('/api/companies/:name', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  try {
    await fs.writeFile(path.join(ROOT, 'companies', req.params.name + '.md'), req.body.content || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- command endpoints (spawn claude -p) -----------------------------------
app.post('/api/prep', async (req, res) => {
  try {
    const { company, round } = req.body;
    if (!company || !round) return res.status(400).json({ error: 'company and round required' });
    if (!safeName(company)) return res.status(400).json({ error: 'bad company name' });
    const out = await runClaude('/prep ' + company + ', ' + round);
    // Save the prep into the company's output folder so it accumulates and is downloadable,
    // and so future preps can read prior ones. Never block the response on a save failure.
    let prep_file = null;
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const roundSlug = round.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 40) || 'round';
      const fname = `prep-${roundSlug}-${date}.md`;
      const dir = path.join(ROOT, 'output', company);
      await fs.mkdir(dir, { recursive: true });
      const header = `# Prep — ${company} — ${round}\n_Generated ${new Date().toISOString().slice(0, 10)}_\n\n`;
      await fs.writeFile(path.join(dir, fname), header + out);
      prep_file = company + '/' + fname;
    } catch (_) { /* save is best-effort; the rendered output still returns */ }
    res.json({ output: out, prep_file });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/match', async (req, res) => {
  try {
    const jd = (req.body.jd || '').trim();
    if (!jd) return res.status(400).json({ error: 'jd required' });
    const out = await runClaude('/tailor-analyse ' + jd);
    // Verdict (APPLY/MAYBE/SKIP) stays an LLM judgement; the ATS score does NOT — it's
    // the same deterministic keyword-coverage engine as the Tailor tab, run here against
    // the base resumes so both tabs report a consistent, reproducible number.
    const m = out.match(/<!--\s*MATCH:\s*verdict=(APPLY|MAYBE|SKIP)\s+score=\d{1,3}\s*-->/i);
    const verdict = m ? m[1].toUpperCase() : null;
    const output = out.replace(/<!--\s*MATCH:[\s\S]*?-->/i, '').trim();
    const ats = computeAtsScore(jd, await getBaseResumeText());
    const score = ats ? ats.score : null;
    res.json({ output, verdict, score, ats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/log', async (req, res) => {
  try {
    const { company, note } = req.body;
    if (!company || !note) return res.status(400).json({ error: 'company and note required' });
    const out = await runClaude('/log ' + company + ' ' + note);
    res.json({ output: out });
    // same outcome-learning trigger as the instant Log button, so AI-logged outcomes also learn
    if (safeName(company) && noteIsOutcome(note)) learnInBackground(company, note.trim());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/log-direct', async (req, res) => {
  try {
    const { company, note, stage } = req.body;
    if (!company || !safeName(company)) return res.status(400).json({ error: 'bad company' });
    if (!note || !note.trim()) return res.status(400).json({ error: 'note required' });

    const today = new Date().toISOString().slice(0, 10);
    const coPath = path.join(ROOT, 'companies', company + '.md');
    let content = '';
    try { content = await fs.readFile(coPath, 'utf8'); } catch (e) {}

    const entry = `- ${today} | ${note.trim()}`;
    if (content.includes('## Process log')) {
      content = content.replace(/## Process log\n/, '## Process log\n' + entry + '\n');
    } else {
      content += '\n\n## Process log\n' + entry + '\n';
    }
    if (stage && content.match(/^- Stage:/m)) {
      content = content.replace(/^(- Stage:.*)/m, '- Stage: ' + stage);
    }
    await fs.writeFile(coPath, content);

    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    if (stage) pipeline = upsertPipelineRow(pipeline, company, null, stage, today);
    await fs.writeFile(pipelinePath, pipeline);

    // Respond instantly (the log must be < 2s); if this note is an outcome/feedback, learn from it in
    // the background and stage proposals for review — never block the log on the Claude pass.
    const learning = noteIsOutcome(note, stage);
    res.json({ ok: true, entry, learning });
    if (learning) learnInBackground(company, note.trim());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/intake', async (req, res) => {
  try {
    const notes = (req.body.notes || '').trim();
    if (!notes) return res.status(400).json({ error: 'notes required' });
    const out = await runClaude('/intake ' + notes);
    res.json({ output: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Onboarding: report whether this checkout has a usable profile + base resume yet.
app.get('/api/setup-status', async (req, res) => {
  try {
    res.json(await getSetupStatus());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Onboarding: turn an uploaded résumé (+ optional details) into a grounded CLAUDE.md via /onboard.
// The résumé is also saved into resumes/ as the base resume, so the very next step (tailoring)
// works without a separate upload. Guarded so it never clobbers an existing real profile.
app.post('/api/onboard', async (req, res) => {
  try {
    const { onboarded } = await getSetupStatus();
    if (onboarded) return res.status(409).json({ error: 'A profile already exists. Edit CLAUDE.md by hand to avoid overwriting it.' });

    const { file_base64, file_ext, filename, notes, comp, work_auth, spelling, text } = req.body;
    let resumeText = '', savedResume = null;

    if (file_base64) {
      const ext = (file_ext || '').toLowerCase();
      if (ext !== 'pdf' && ext !== 'docx') return res.status(400).json({ error: 'résumé must be a PDF or DOCX file' });
      const buf = Buffer.from(file_base64, 'base64');
      resumeText = await extractResumeText(buf, ext);
      // Save it as the base resume the tailor will read later.
      let safe = (filename || ('resume-base.' + ext)).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!/\.(pdf|docx)$/i.test(safe)) safe += '.' + ext;
      await fs.mkdir(path.join(ROOT, 'resumes'), { recursive: true });
      await fs.writeFile(path.join(ROOT, 'resumes', safe), buf);
      savedResume = safe;
    }

    // Assemble the /onboard input: résumé text is the spine; the structured fields are confirmed
    // facts that fill the gaps a CV can't (comp, work auth, spelling); notes/text are extra context.
    const fields = [];
    if (comp && comp.trim()) fields.push('- Compensation target / range: ' + comp.trim());
    if (work_auth && work_auth.trim()) fields.push('- Work authorisation / location: ' + work_auth.trim());
    if (spelling && spelling.trim()) fields.push('- Preferred spelling: ' + spelling.trim());
    const extra = [(notes || '').trim(), (text || '').trim()].filter(Boolean).join('\n\n');

    let input = '';
    if (resumeText) input += 'RESUME (extracted from the uploaded file — primary source of truth):\n' + resumeText + '\n\n';
    if (fields.length) input += 'CONFIRMED PROFILE DETAILS (provided directly by the user — treat as facts and use these to fill the matching sections; do NOT leave them as [ADD]):\n' + fields.join('\n') + '\n\n';
    if (extra) input += 'EXTRA CONTEXT / NOTES FROM THE USER:\n' + extra + '\n';
    input = input.trim();

    if (!input) return res.status(400).json({ error: 'upload your résumé (PDF or DOCX), or add some career notes' });

    const out = await runClaude('/onboard ' + input);
    const status = await getSetupStatus();
    res.json({ output: out, saved_resume: savedResume, ...status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/outputs', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(ROOT, 'output'));
    res.json({ files: files.filter(f => f.endsWith('.md')).sort().reverse() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/outputs/:company/:filename', (req, res) => {
  const company = req.params.company;
  const name = req.params.filename;
  // company is a slug; filename may contain spaces (e.g. "Cover Letter.pdf") but must not traverse paths
  if (!safeName(company.replace(/-/g,'')) || /[\/\\]/.test(name) || name.includes('..'))
    return res.status(400).send('bad path');
  res.download(path.join(ROOT, 'output', company, name), name, err => {
    if (err) res.status(404).send('not found');
  });
});

app.get('/api/outputs/:filename', (req, res) => {
  const name = req.params.filename;
  if (!safeName(name.replace(/\./g, '').replace(/-/g, ''))) return res.status(400).send('bad name');
  res.download(path.join(ROOT, 'output', name), name, err => {
    if (err) res.status(404).send('not found');
  });
});

app.post('/api/mark-sent', async (req, res) => {
  try {
    const { company, filename, ats_score, jd_title, date } = req.body;
    if (!company || !safeName(company)) return res.status(400).json({ error: 'bad company' });
    const coPath = path.join(ROOT, 'companies', company + '.md');
    let content = '';
    try { content = await fs.readFile(coPath, 'utf8'); } catch (e) {}
    const jdSnippet = (req.body.jd_snippet || '').substring(0, 800);
    const today = new Date().toISOString().slice(0, 10);
    const sentEntry = [
      `- ${date} | ${filename} | ATS score: ${ats_score}% | JD: ${jd_title} | Outcome: pending`,
      jdSnippet ? `  JD snapshot: ${jdSnippet}` : ''
    ].filter(Boolean).join('\n');
    const logEntry = `- ${today} | Resume sent: ${filename} (ATS ${ats_score}%, role: ${jd_title})`;
    if (content.includes('## Resumes sent')) {
      content = content.replace(/## Resumes sent\n/, '## Resumes sent\n' + sentEntry + '\n');
    } else {
      content += '\n\n## Resumes sent\n' + sentEntry + '\n';
    }
    if (content.includes('## Process log')) {
      content = content.replace(/## Process log\n/, '## Process log\n' + logEntry + '\n');
    }
    // record/refresh this application in the "## Applications" history and sync the
    // top-level Stage/Role/Resume-used to it (handles 2nd+ applications to one company).
    content = recordApplication(content, {
      company, date, role: jd_title, stage: 'Submitted', resume: filename, ats: ats_score,
    });
    await fs.writeFile(coPath, content);
    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    const today2 = new Date().toISOString().slice(0, 10);
    pipeline = upsertPipelineRow(pipeline, company, jd_title, 'Submitted', today2);
    await fs.writeFile(pipelinePath, pipeline);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/companies/:name/close', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  const { outcome } = req.body;
  const name = req.params.name;
  try {
    const coPath = path.join(ROOT, 'companies', name + '.md');
    let content = await fs.readFile(coPath, 'utf8');
    const date = new Date().toISOString().slice(0,10);
    const out = (outcome || 'Closed').trim();
    // The pipeline UI only buckets a row as Closed when the stage text matches
    // /reject|declined|closed|filled|withdraw/. Free-text outcomes the prompt itself
    // suggests (e.g. "Withdrew", "No response", "Not pursuing") don't match, so a closed
    // row would wrongly stay in the active funnel. Guarantee a Closed-bucket stage here.
    const closedStage = /reject|declined|closed|filled|withdraw/i.test(out) ? out : `Closed — ${out}`;
    const entry = `- ${date} | Status: ${out}`;
    if (content.match(/^- Stage:/m)) {
      content = content.replace(/^(- Stage:.*)/m, `- Stage: ${closedStage}`);
    }
    // also stamp the current application's history block with the closed stage + outcome
    content = closeCurrentApplication(content, closedStage, out);
    if (content.includes('## Process log')) {
      content = content.replace(/## Process log\n/, `## Process log\n${entry}\n`);
    }
    await fs.writeFile(coPath, content);

    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    pipeline = updatePipelineStage(pipeline, name, closedStage);
    await fs.writeFile(pipelinePath, pipeline);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/companies/:name', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  const name = req.params.name;
  try {
    await fs.unlink(path.join(ROOT, 'companies', name + '.md')).catch(() => {});
    // remove per-company subdir
    await fs.rm(path.join(ROOT, 'output', name), { recursive: true, force: true }).catch(() => {});
    // remove any flat output files matching resume-<name>-*
    const flatDir = path.join(ROOT, 'output');
    const flatFiles = await fs.readdir(flatDir).catch(() => []);
    await Promise.all(
      flatFiles
        .filter(f => f.startsWith('resume-' + name + '-'))
        .map(f => fs.unlink(path.join(flatDir, f)).catch(() => {}))
    );
    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    const nameVariants = [name, name.replace(/-/g, ' ')];
    pipeline = pipeline.split('\n')
      .filter(line => !(line.startsWith('|') && nameVariants.some(v => line.toLowerCase().includes(v))))
      .join('\n');
    await fs.writeFile(pipelinePath, pipeline);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flag-fabricated', async (req, res) => {
  try {
    const { bullet } = req.body;
    if (!bullet) return res.status(400).json({ error: 'bullet required' });
    const claudePath = path.join(ROOT, 'CLAUDE.md');
    let content = await fs.readFile(claudePath, 'utf8');
    const entry = `- Do NOT use: "${bullet.substring(0, 200).replace(/"/g, "'")}"`;
    if (content.includes('## Fabrication log')) {
      content = content.replace(/## Fabrication log\n/, '## Fabrication log\n' + entry + '\n');
    } else {
      content += '\n\n## Fabrication log\n' + entry + '\n';
    }
    await fs.writeFile(claudePath, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/companies/:name/files', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  try {
    const dir = path.join(ROOT, 'output', req.params.name);
    const files = await fs.readdir(dir);
    res.json({ files: files.filter(f => /\.(docx|html|md|pdf)$/i.test(f)).sort().reverse() });
  } catch (e) {
    res.json({ files: [] });
  }
});

// Returns the latest captured JD text for a company (from output/<name>/jd-*.md).
app.get('/api/companies/:name/jd', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  try {
    const dir = path.join(ROOT, 'output', req.params.name);
    const files = (await fs.readdir(dir)).filter(f => /^jd-.*\.md$/.test(f)).sort().reverse();
    if (!files.length) return res.json({ content: '', filename: null });
    const content = await fs.readFile(path.join(dir, files[0]), 'utf8');
    res.json({ content, filename: files[0] });
  } catch (e) {
    res.json({ content: '', filename: null });
  }
});

// Save a manually-pasted JD for a company (recovers cases where capture only stored a
// URL, e.g. auth-walled LinkedIn postings). Writes output/<name>/jd-<today>.md so /prep
// and /tailor can ground on the real text.
app.post('/api/companies/:name/jd', async (req, res) => {
  if (!safeName(req.params.name)) return res.status(400).json({ error: 'bad name' });
  const jd = (req.body.jd || '').trim();
  if (jd.length < 40) return res.status(400).json({ error: 'jd text required' });
  try {
    const name = req.params.name;
    const coDir = path.join(ROOT, 'output', name);
    await fs.mkdir(coDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const title = (req.body.title || '').trim();
    const header = `# JD — ${title || name} — ${name}\n_Captured ${today} (pasted)_\n\n`;
    await fs.writeFile(path.join(coDir, 'jd-' + today.replace(/-/g, '') + '.md'), header + jd);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rebuild-resume', async (req, res) => {
  try {
    const { resume_data, resume_markdown } = req.body;
    if (!resume_data || !resume_data.slug || !resume_data.date)
      return res.status(400).json({ error: 'resume_data with slug and date required' });
    const coDir = path.join(ROOT, 'output', resume_data.slug);
    await fs.mkdir(coDir, { recursive: true });
    const docxFile = resume_data.slug + '/resume-' + resume_data.slug + '-' + resume_data.date + '.docx';
    const htmlFile = resume_data.slug + '/resume-' + resume_data.slug + '-' + resume_data.date + '.html';
    if (resume_markdown && resume_markdown.trim()) {
      // render the edited markdown verbatim — what the user sees is what downloads
      await fs.writeFile(path.join(ROOT, 'output', docxFile), await mdToDocx(resume_markdown));
      await fs.writeFile(path.join(ROOT, 'output', htmlFile), mdToHtml(resume_markdown));
    } else {
      await fs.writeFile(path.join(ROOT, 'output', docxFile), await buildDocx(resume_data));
      await fs.writeFile(path.join(ROOT, 'output', htmlFile), buildPrintHtml(resume_data));
    }
    res.json({ docx_file: docxFile, html_file: htmlFile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/run', async (req, res) => {
  try {
    const { prompt, jd } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const out = await runClaude(prompt);

    console.log('[/api/run] raw out length:', out.length);

    const jsonMatch    = out.match(/<!--\s*RESUME_JSON\s*([\s\S]*?)-->/);
    const diffMatch    = out.match(/<!--\s*DIFF_DATA\s*([\s\S]*?)-->/);
    const savedMatch   = out.match(/<!--\s*SAVED:\s*(output\/[^\s]+)\s*-->/);
    const savedCL      = out.match(/<!--\s*SAVED_CL:\s*(output\/[^\s]+)\s*-->/);
    const savedJD      = out.match(/<!--\s*SAVED_JD:\s*(output\/[^\s]+)\s*-->/);
    const diffSumMatch = out.match(/<!--\s*DIFF_SUMMARY:\s*added=(\d+)\s+modified=(\d+)\s+removed=(\d+)\s*-->/);

    console.log('[/api/run] jsonMatch:', !!jsonMatch, '| savedMatch:', savedMatch ? savedMatch[1] : null);

    let resumeData = null, docxFile = null, htmlFile = null, resumePreview = null, mdContent = null, mdSrcName = null, gates = null;

    if (jsonMatch) {
      try {
        resumeData = JSON.parse(jsonMatch[1].trim());
        const coDir = path.join(ROOT, 'output', resumeData.slug);
        await fs.mkdir(coDir, { recursive: true });
        // Persist the full JD so prep can diff it against the CV later. The JD is otherwise
        // discarded after tailoring. The skill now writes the resolved JD itself (SAVED_JD marker)
        // — including fetching the text when the input was a URL — so only fall back to saving the
        // request body here when the skill didn't, and never persist a bare URL string.
        const jdInput = (jd || '').trim();
        const jdIsBareUrl = /^https?:\/\/\S+$/.test(jdInput);
        if (!savedJD && jdInput && !jdIsBareUrl) {
          const header = `# JD — ${resumeData.jd_title || 'Role'} — ${resumeData.slug}\n_Captured ${resumeData.date}_\n\n`;
          await fs.writeFile(path.join(coDir, 'jd-' + resumeData.date + '.md'), header + jdInput)
            .catch(e => console.error('[/api/run] JD save error:', e.message));
        }
        docxFile = resumeData.slug + '/resume-' + resumeData.slug + '-' + resumeData.date + '.docx';
        htmlFile = resumeData.slug + '/resume-' + resumeData.slug + '-' + resumeData.date + '.html';
        if (savedMatch) {
          const mdSrc  = path.join(ROOT, savedMatch[1]);
          const mdDest = path.join(ROOT, 'output', resumeData.slug,
            'resume-' + resumeData.slug + '-' + resumeData.date + '.md');
          try {
            mdContent = await fs.readFile(mdSrc, 'utf8');
            await fs.writeFile(mdDest, mdContent);
            await fs.unlink(mdSrc).catch(() => {});
            resumePreview = mdContent;
            resumeData.sections = serverParseMd(mdContent);
          } catch (e) { console.error('[/api/run] md move error:', e.message); }
        }
        // auto-create company file if it doesn't exist yet; otherwise, if this tailor is for a
        // DIFFERENT role than the company's current one, record it as a new (Tailored) application.
        const coFile = path.join(ROOT, 'companies', resumeData.slug + '.md');
        const draftName = `resume-${resumeData.slug}-${resumeData.date}.docx`;
        const appOpts = {
          date: resumeData.date, role: resumeData.jd_title || 'Role', stage: 'Tailored',
          resume: draftName, jd: `jd-${resumeData.date}.md`, outcome: 'not yet submitted',
        };
        let coExists = true;
        try { await fs.access(coFile); } catch (e) { coExists = false; }
        try {
          if (!coExists) {
            const title = resumeData.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let stub = `# ${title}\n\n- Stage: Tailored\n- Role: ${resumeData.jd_title || 'Role'}\n\n## Applications\n\n## Process log\n\n## Resumes sent\n`;
            await fs.writeFile(coFile, recordApplication(stub, appOpts));
          } else {
            const cur = await fs.readFile(coFile, 'utf8');
            const m = cur.match(/^- Role:\s*(.+)$/m);
            const curRole = m ? m[1].trim().toLowerCase() : '';
            const newRole = (resumeData.jd_title || '').trim().toLowerCase();
            // Only when the current role is known AND differs — a new application is beginning.
            // Same-role re-tailors leave the file (and any Submitted stage) untouched.
            if (curRole && newRole && curRole !== newRole) {
              await fs.writeFile(coFile, recordApplication(cur, appOpts));
            }
          }
        } catch (e) { console.error('[/api/run] company-file application record error:', e.message); }
        // show tailored-but-unsent resumes in the pipeline too — but only INSERT when the company is
        // not already there, so a re-tailor never downgrades an existing Submitted/Interview row.
        try {
          const pipelinePath = path.join(ROOT, 'pipeline.md');
          const pipeline = await fs.readFile(pipelinePath, 'utf8');
          const present = updatePipelineStage(pipeline, resumeData.slug, '__probe__') !== pipeline;
          if (!present) {
            const withRow = upsertPipelineRow(pipeline, resumeData.slug, resumeData.jd_title,
              'Tailored — not yet submitted', resumeData.date);
            await fs.writeFile(pipelinePath, withRow);
          }
        } catch (e) { console.error('[/api/run] pipeline upsert error:', e.message); }
      } catch (e) { console.error('[/api/run] Build error:', e.message); }
    }

    // fallback 1: read .md directly from SAVED marker path
    if (!resumePreview && savedMatch) {
      try {
        resumePreview = await fs.readFile(path.join(ROOT, savedMatch[1]), 'utf8');
        mdSrcName = path.basename(savedMatch[1]);
        console.log('[/api/run] resumePreview loaded via SAVED fallback, length:', resumePreview.length);
      } catch (e) { console.log('[/api/run] SAVED fallback read failed:', e.message); }
    }

    // fallback 2: scan output/ for any resume-*.md modified in the last 10 minutes
    if (!resumePreview) {
      try {
        const outDir = path.join(ROOT, 'output');
        const cutoff = Date.now() - 10 * 60 * 1000;
        const entries = await fs.readdir(outDir, { withFileTypes: true });
        const candidates = [];
        for (const e of entries) {
          if (e.isFile() && e.name.startsWith('resume-') && e.name.endsWith('.md')) {
            const stat = await fs.stat(path.join(outDir, e.name));
            if (stat.mtimeMs >= cutoff) candidates.push({ name: e.name, mtime: stat.mtimeMs, dir: outDir });
          } else if (e.isDirectory()) {
            try {
              const sub = await fs.readdir(path.join(outDir, e.name));
              for (const f of sub) {
                if (f.startsWith('resume-') && f.endsWith('.md')) {
                  const stat = await fs.stat(path.join(outDir, e.name, f));
                  if (stat.mtimeMs >= cutoff) candidates.push({ name: f, mtime: stat.mtimeMs, dir: path.join(outDir, e.name) });
                }
              }
            } catch (e2) {}
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.mtime - a.mtime);
          resumePreview = await fs.readFile(path.join(candidates[0].dir, candidates[0].name), 'utf8');
          mdSrcName = candidates[0].name;
          console.log('[/api/run] resumePreview loaded via scan fallback:', candidates[0].name, 'length:', resumePreview.length);
        }
      } catch (e) { console.log('[/api/run] scan fallback failed:', e.message); }
    }

    console.log('[/api/run] resumePreview length:', resumePreview ? resumePreview.length : 0);

    // Build the downloadable DOCX/HTML from the resume markdown — one place, so the download
    // buttons appear whenever we recovered a resume, even when the RESUME_JSON marker was absent.
    let finalMd = mdContent || resumePreview;
    if (finalMd && finalMd.trim()) {
      if (!docxFile) {
        // RESUME_JSON was absent — derive slug/date from the recovered md filename and
        // relocate it into output/<slug>/ so everything lives alongside the downloads.
        const m = (mdSrcName || '').match(/resume-(.+)-(\d{6,8})\.md$/);
        if (m) {
          const slug = m[1], date = m[2];
          docxFile = slug + '/resume-' + slug + '-' + date + '.docx';
          htmlFile = slug + '/resume-' + slug + '-' + date + '.html';
          await fs.mkdir(path.join(ROOT, 'output', slug), { recursive: true });
          await fs.writeFile(path.join(ROOT, 'output', slug, 'resume-' + slug + '-' + date + '.md'), finalMd).catch(() => {});
          // remove the top-level copy left by the skill, if any
          if (!mdSrcName.includes('/')) await fs.unlink(path.join(ROOT, 'output', mdSrcName)).catch(() => {});
        }
      }
      // INDEPENDENT QUALITY GATES — run BEFORE building the downloads so a gate's safe fixes land in
      // the DOCX/HTML the user actually gets. Separate claude passes (see runResumeGates).
      const gateSlug = (resumeData && resumeData.slug) || (docxFile ? docxFile.split('/')[0] : null);
      if (gateSlug) {
        try {
          gates = await runResumeGates(gateSlug);
          // a gate may have edited the saved md — re-read it so downloads + preview reflect the fixes
          const mdPath = path.join(ROOT, 'output', docxFile.replace(/\.docx$/, '.md'));
          const reread = await fs.readFile(mdPath, 'utf8').catch(() => null);
          if (reread && reread.trim()) { finalMd = reread; resumePreview = reread; }
          console.log('[/api/run] gates:', JSON.stringify(gates));
        } catch (e) { console.error('[/api/run] gates error:', e.message); }
      }
      if (docxFile) {
        try {
          await fs.writeFile(path.join(ROOT, 'output', docxFile), await mdToDocx(finalMd));
          await fs.writeFile(path.join(ROOT, 'output', htmlFile), mdToHtml(finalMd));
        } catch (e) {
          console.error('[/api/run] download build error:', e.message);
          docxFile = null; htmlFile = null;
        }
      }
    }

    let diffData = null;
    if (diffMatch) { try { diffData = JSON.parse(diffMatch[1].trim()); } catch (e) {} }

    const diffSummary = diffSumMatch ? {
      added:    parseInt(diffSumMatch[1]),
      modified: parseInt(diffSumMatch[2]),
      removed:  parseInt(diffSumMatch[3]),
    } : null;

    const clean = out
      .replace(/<!--\s*RESUME_JSON[\s\S]*?-->/g, '')
      .replace(/<!--\s*DIFF_DATA[\s\S]*?-->/g, '')
      .replace(/<!--\s*DIFF_SUMMARY[^>]*-->/g, '')
      .replace(/<!--\s*SAVED[^>]*-->/g, '')
      .trim();

    console.log('[/api/run] clean output length:', clean.length, '| docxFile:', docxFile);

    // Deterministic ATS keyword-coverage score (JD vs the tailored resume text).
    const ats = (jd && finalMd) ? computeAtsScore(jd, finalMd) : null;

    res.json({
      output:         clean,
      resume_preview: resumePreview,
      resume_data:    resumeData,
      diff_data:      diffData,
      diff_summary:   diffSummary,
      docx_file:      docxFile,
      html_file:      htmlFile,
      saved_cover:    savedCL ? savedCL[1] : null,
      ats,
      screen:         gates ? gates.screen : null,
      verify:         gates ? gates.verify : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upload-sent', async (req, res) => {
  try {
    const { company, filename, file_base64, file_ext, ats_score, jd_title, date } = req.body;
    if (!company || !safeName(company)) return res.status(400).json({ error: 'bad company' });
    if (!file_base64) return res.status(400).json({ error: 'no file data' });

    const coDir = path.join(ROOT, 'output', company);
    await fs.mkdir(coDir, { recursive: true });

    const ext = (file_ext || 'docx').replace(/^\./, '').toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const usedDate = (date || today).replace(/[^0-9-]/g, '');
    const rawName = filename || ('resume-' + company + '-' + usedDate + '.' + ext);
    const safeFname = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const buf = Buffer.from(file_base64, 'base64');

    // preserve the most recent tailored draft (.md) as _draft.md so the learning step
    // can diff draft -> submitted. The delete loop below would otherwise destroy it.
    try {
      const existing = await fs.readdir(coDir);
      const draftMds = existing
        .filter(f => f !== safeFname && /^resume-.*\.md$/.test(f))
        .sort().reverse();
      if (draftMds.length) {
        const draftText = await fs.readFile(path.join(coDir, draftMds[0]), 'utf8');
        await fs.writeFile(path.join(coDir, '_draft.md'), draftText);
      }
    } catch (e) {}

    // delete all prior generated resume files (drafts) — uploaded file is the source of truth
    try {
      const existing = await fs.readdir(coDir);
      await Promise.all(
        existing
          .filter(f => f !== safeFname && /^resume-/.test(f) && /\.(docx|html|md)$/.test(f))
          .map(f => fs.unlink(path.join(coDir, f)).catch(() => {}))
      );
    } catch (e) {}

    // If a submitted file with this name already exists from a PRIOR application, archive it
    // instead of overwriting — otherwise the earlier application's submitted resume is lost
    // (this is the bug that ate idealo's Operations Lead PDF). "Prior application" = the
    // existing file is from another day, or the company's current role differs from this JD.
    try {
      const target = path.join(coDir, safeFname);
      const prev = await fs.stat(target).catch(() => null);
      if (prev) {
        const prevDate = new Date(prev.mtime).toISOString().slice(0, 10);
        let roleChanged = false;
        try {
          const cur = await fs.readFile(path.join(ROOT, 'companies', company + '.md'), 'utf8');
          const m = cur.match(/^- Role:\s*(.+)$/m);
          if (m && jd_title && m[1].trim().toLowerCase() !== String(jd_title).trim().toLowerCase()) roleChanged = true;
        } catch (e) {}
        if (prevDate !== usedDate || roleChanged) {
          const archiveDir = path.join(coDir, 'archive');
          await fs.mkdir(archiveDir, { recursive: true });
          const suffix = prevDate.replace(/-/g, '');
          const withSuffix = n => n.replace(/(\.[^.]+)$/, `-${suffix}$1`);
          await fs.rename(target, path.join(archiveDir, withSuffix(safeFname))).catch(() => {});
          const mdName = safeFname.replace(/\.(docx|pdf)$/i, '.md');
          if (mdName !== safeFname) {
            const mdTarget = path.join(coDir, mdName);
            if (await fs.stat(mdTarget).catch(() => null))
              await fs.rename(mdTarget, path.join(archiveDir, withSuffix(mdName))).catch(() => {});
          }
        }
      }
    } catch (e) { console.error('[upload-sent] archive error:', e.message); }

    await fs.writeFile(path.join(coDir, safeFname), buf);

    // extract text from DOCX/PDF and save as canonical .md — fast, no Claude needed.
    // This .md is what the learning step diffs against the draft, so both formats must extract.
    let extracted = false;
    try {
      const text = await extractResumeText(buf, ext);
      if (text) {
        await fs.writeFile(path.join(coDir, safeFname.replace(/\.(docx|pdf)$/i, '.md')), text);
        extracted = true;
      }
    } catch (e) {
      console.error('[upload-sent] text extraction error:', e.message);
    }

    // update company file
    const coPath = path.join(ROOT, 'companies', company + '.md');
    let content = '';
    try { content = await fs.readFile(coPath, 'utf8'); } catch (e) {}

    const sentEntry = `- ${usedDate} | ${safeFname} | ATS score: ${ats_score || '?'}% | JD: ${jd_title || '?'} | Outcome: pending`;
    const logEntry  = `- ${today} | Resume sent: ${safeFname} (ATS ${ats_score || '?'}%, role: ${jd_title || '?'})`;

    if (content.includes('## Resumes sent')) {
      content = content.replace(/## Resumes sent\n/, '## Resumes sent\n' + sentEntry + '\n');
    } else {
      content += '\n\n## Resumes sent\n' + sentEntry + '\n';
    }
    if (content.includes('## Process log')) {
      content = content.replace(/## Process log\n/, '## Process log\n' + logEntry + '\n');
    }
    // record/refresh this application in "## Applications" and sync the top-level
    // Stage/Role/Resume-used (the submitted file, usually a PDF) to it.
    content = recordApplication(content, {
      company, date: usedDate, role: jd_title, stage: 'Submitted', resume: safeFname, ats: ats_score,
    });
    await fs.writeFile(coPath, content);

    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    pipeline = upsertPipelineRow(pipeline, company, jd_title, 'Submitted', today);
    await fs.writeFile(pipelinePath, pipeline);

    res.json({ ok: true, filename: safeFname, extracted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/extract-context', async (req, res) => {
  try {
    const { company } = req.body;
    if (!company || !safeName(company)) return res.status(400).json({ error: 'bad company' });

    // gather the three signals: submitted resume (source of truth), the machine draft
    // /tailor produced (stashed on upload), and the JD the resume was tailored against.
    const coDir = path.join(ROOT, 'output', company);
    let submittedText = null, draftText = null, jdText = null;
    try {
      const files = await fs.readdir(coDir);
      // Pick the user's SUBMITTED resume — exclude every generated/system .md so the loop never reads
      // a report (screen-/verify-), the JD, a cover letter, the stashed draft, or the machine-tailored
      // resume-<slug>-<date>.md as if it were the submission.
      const GENERATED = /^(_draft|jd-|screen-|verify-|cover-letter-|pending-lessons)/;
      const subMds = files
        .filter(f => f.endsWith('.md') && !GENERATED.test(f) && !/^resume-.+-\d{6,8}\.md$/.test(f))
        .sort().reverse();
      if (subMds.length) submittedText = (await fs.readFile(path.join(coDir, subMds[0]), 'utf8')).trim();
      // Fallback for resumes uploaded before PDF support: no .md yet — extract the
      // newest submitted PDF/DOCX on the fly and cache it as .md.
      if (!submittedText) {
        const docs = files.filter(f => /\.(pdf|docx)$/i.test(f)).sort().reverse();
        if (docs.length) {
          const docExt = docs[0].split('.').pop().toLowerCase();
          const buf = await fs.readFile(path.join(coDir, docs[0]));
          submittedText = await extractResumeText(buf, docExt);
          if (submittedText) {
            await fs.writeFile(path.join(coDir, docs[0].replace(/\.(pdf|docx)$/i, '.md')), submittedText).catch(() => {});
          }
        }
      }
      if (files.includes('_draft.md')) draftText = (await fs.readFile(path.join(coDir, '_draft.md'), 'utf8')).trim();
      const jds = files.filter(f => /^jd-.*\.md$/.test(f)).sort().reverse();
      if (jds.length) jdText = (await fs.readFile(path.join(coDir, jds[0]), 'utf8')).trim();
    } catch (e) {}

    if (!submittedText) return res.json({ new_bullets: [], framing_lessons: [], corrections: [], conflicts: [] });

    const empty = { new_bullets: [], framing_lessons: [], corrections: [], conflicts: [] };
    const prompt = `You are improving a resume-tailoring system whose single goal is to produce a tailored resume that clears recruiter/ATS screening. Read CLAUDE.md first — especially the achievement bank, the "Positioning", "Voice rules", "Honesty rules" and "Fabrication log" sections.

Below are up to three artefacts for the role at "${company}":
${jdText ? `\n=== JOB DESCRIPTION ===\n${jdText.substring(0, 6000)}\n` : '\n(No JD captured for this role.)\n'}${draftText ? `\n=== MACHINE-TAILORED DRAFT (what /tailor produced) ===\n${draftText.substring(0, 14000)}\n` : '\n(No machine draft available — the user uploaded without tailoring in this tool.)\n'}
=== SUBMITTED RESUME (what the user actually sent after their own edits — the screening-intended source of truth) ===
${submittedText.substring(0, 14000)}

Produce THREE things:

1. "new_bullets": genuinely NEW facts/achievements present in the submitted resume that are NOT already in the achievement bank and are worth reusing. Only real new facts — never rephrasings of existing bullets.

2. "framing_lessons": ${draftText ? 'Compare the draft against the submitted version. ' : ''}Infer GENERALISABLE tailoring rules from how the submitted resume is positioned relative to the JD${draftText ? ', and from what the user changed, cut, reordered or re-emphasised versus the draft' : ''}. Each lesson must be ONE concise, reusable imperative rule that would make the NEXT tailored resume more likely to clear screening — about positioning, emphasis, section ordering, what to cut, tone, or keyword coverage. Make them generalisable (e.g. "When a JD is QA-titled but the role is EM-scope, lead with engineering leadership and treat quality as a differentiator"), NOT a narration of this one resume, and NOT new facts. Never propose anything that conflicts with the Honesty rules / Fabrication log. If the submitted resume and the draft are essentially the same, return [].

3. "corrections": facts in the SUBMITTED resume that CONTRADICT or UPDATE a fact already in the achievement bank — the source-of-truth resume now says something different from the bank (a different technology, a changed number, an updated tenure, a renamed tool). For each return an object {"old": "<the outdated fact, quoting the bank's wording as closely as possible>", "new": "<the corrected fact from the submitted resume>", "why": "<one short line>"}. These are NOT new facts and NOT rephrasings — only genuine disagreements where the bank is now out of date (e.g. bank says "Kafka" but the submitted resume says "SQS"; bank says "12+ years" but the resume says "13 years"). The submitted resume is USUALLY the source of truth — BUT NOT ALWAYS. If the submitted resume's differing value would REINTRODUCE something the Fabrication log / Honesty rules forbid (e.g. it writes German as "B1" when the rules say "working towards B1"; or a banned title/term), do NOT put it in "corrections" — the resume is the error there. Put it in "conflicts" instead. Return [] if none.

4. "conflicts": places where the SUBMITTED resume violates the Fabrication log / Honesty rules / a fixed fact (the resume is likely the mistake, not the bank). For each return an object {"in_resume": "<what the resume says>", "rule": "<the rule it breaks>", "why": "<one short line, e.g. 'you are not yet B1 — keep \\"working towards B1\\"'>"}. These must NEVER be auto-applied to the bank — they are warnings for the user to fix on the resume. Return [] if none.

Return raw JSON only, no markdown fences: {"new_bullets":[...],"framing_lessons":[...],"corrections":[...],"conflicts":[...]}`;
    const detConflicts = scanFabricationConflicts(submittedText); // deterministic, runs regardless of the LLM
    const out = await runClaude(prompt);
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return res.json({ ...empty, conflicts: detConflicts });
    try {
      const parsed = JSON.parse(m[0]);
      // The model sometimes returns objects ({bullet, note, company}) instead of plain
      // strings — normalise both arrays to clean strings so the UI and add-to-bank don't break.
      const toStr = x => {
        if (typeof x === 'string') return x.trim();
        if (x && typeof x === 'object') return String(x.bullet || x.lesson || x.text || '').trim();
        return '';
      };
      const norm = arr => (Array.isArray(arr) ? arr.map(toStr).filter(Boolean) : []);
      const normCorr = arr => (Array.isArray(arr) ? arr.map(c =>
        (c && typeof c === 'object') ? { old: String(c.old || '').trim(), new: String(c.new || '').trim(), why: String(c.why || '').trim() } : null
      ).filter(c => c && c.old && c.new) : []);
      const normConflict = arr => (Array.isArray(arr) ? arr.map(c =>
        (c && typeof c === 'object') ? { in_resume: String(c.in_resume || '').trim(), rule: String(c.rule || '').trim(), why: String(c.why || '').trim() } : null
      ).filter(c => c && c.in_resume) : []);
      res.json({
        new_bullets: norm(parsed.new_bullets),
        framing_lessons: norm(parsed.framing_lessons),
        corrections: normCorr(parsed.corrections),
        // deterministic fab-log scan + the LLM's conflicts, so a banned reintroduction (e.g. German "B1")
        // is caught reliably even when the model misses it
        conflicts: dedupeConflicts(detConflicts.concat(normConflict(parsed.conflicts))),
      });
    } catch { res.json({ ...empty, conflicts: detConflicts }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/add-to-bank', async (req, res) => {
  try {
    const { bullets } = req.body;
    if (!bullets || !bullets.length) return res.status(400).json({ error: 'no bullets' });
    const claudePath = path.join(ROOT, 'CLAUDE.md');
    let content = await fs.readFile(claudePath, 'utf8');
    const newLines = bullets.map(b => '- ' + b.replace(/^[-*•]\s*/, '')).join('\n');
    if (content.includes('## Target companies')) {
      content = content.replace('## Target companies', newLines + '\n\n## Target companies');
    } else {
      content += '\n' + newLines;
    }
    await fs.writeFile(claudePath, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/add-lessons', async (req, res) => {
  try {
    const { lessons } = req.body;
    if (!lessons || !lessons.length) return res.status(400).json({ error: 'no lessons' });
    const claudePath = path.join(ROOT, 'CLAUDE.md');
    let content = await fs.readFile(claudePath, 'utf8');
    const newLines = lessons.map(l => '- ' + l.replace(/^[-*•]\s*/, '').trim()).join('\n');
    const heading = '## Tailoring lessons (learned from submitted resumes)';
    if (content.includes(heading)) {
      // append under the existing section heading
      content = content.replace(heading + '\n', heading + '\n' + newLines + '\n');
    } else if (content.includes('## Voice rules')) {
      // create the section just above Voice rules so /tailor reads it alongside positioning
      content = content.replace('## Voice rules',
        heading + '\n' + newLines + '\n\n## Voice rules');
    } else {
      content += '\n\n' + heading + '\n' + newLines + '\n';
    }
    await fs.writeFile(claudePath, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Run the OUTCOME-learning engine for a company and return routed lesson proposals for approval.
app.post('/api/learn', async (req, res) => {
  try {
    const { company, feedback } = req.body;
    if (!company || !safeName(company)) return res.status(400).json({ error: 'valid company required' });
    const arg = company + (feedback && feedback.trim() ? ' ' + feedback.trim() : '');
    const out = await runClaude('/learn ' + arg);
    const m = out.match(/\{[\s\S]*"interview_lessons"[\s\S]*\}/);
    let parsed = { interview_lessons: [], tailoring_lessons: [], apply_skip_lessons: [] };
    if (m) { try { parsed = JSON.parse(m[0]); } catch (e) {} }
    const norm = a => Array.isArray(a)
      ? a.map(x => typeof x === 'string' ? x : (x.lesson || x.text || '')).map(s => s.trim()).filter(Boolean)
      : [];
    res.json({
      summary: m ? out.slice(0, m.index).trim() : out.trim(),
      interview_lessons: norm(parsed.interview_lessons),
      tailoring_lessons: norm(parsed.tailoring_lessons),
      apply_skip_lessons: norm(parsed.apply_skip_lessons),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Append approved lessons under their consumer-specific CLAUDE.md section (routes by bucket).
function appendLessons(content, heading, lines) {
  if (!lines || !lines.length) return content;
  const block = lines.map(l => '- ' + l.replace(/^[-*•]\s*/, '').trim()).join('\n');
  if (content.includes(heading)) return content.replace(heading + '\n', heading + '\n' + block + '\n');
  if (content.includes('## Voice rules')) return content.replace('## Voice rules', heading + '\n' + block + '\n\n## Voice rules');
  return content + '\n\n' + heading + '\n' + block + '\n';
}

// Fetch staged (auto-learned, not-yet-approved) lesson proposals for a company.
app.get('/api/pending-lessons/:company', async (req, res) => {
  try {
    const company = req.params.company;
    if (!safeName(company)) return res.status(400).json({ error: 'bad company' });
    const p = path.join(ROOT, 'output', company, 'pending-lessons.json');
    const raw = await fs.readFile(p, 'utf8').catch(() => null);
    res.json(raw ? JSON.parse(raw) : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/add-routed-lessons', async (req, res) => {
  try {
    const { interview_lessons = [], tailoring_lessons = [], apply_skip_lessons = [], company } = req.body;
    const total = interview_lessons.length + tailoring_lessons.length + apply_skip_lessons.length;
    if (!total) return res.status(400).json({ error: 'no lessons' });
    const claudePath = path.join(ROOT, 'CLAUDE.md');
    let content = await fs.readFile(claudePath, 'utf8');
    content = appendLessons(content, '## Tailoring lessons (learned from submitted resumes)', tailoring_lessons);
    content = appendLessons(content, '## Interview lessons (learned from interview outcomes & feedback — READ BY /prep)', interview_lessons);
    content = appendLessons(content, '## Apply/skip lessons (learned from screening & process outcomes — READ BY /tailor-analyse)', apply_skip_lessons);
    await fs.writeFile(claudePath, content);
    // approved → clear the staged proposals so they aren't re-offered
    if (company && safeName(company)) {
      await fs.unlink(path.join(ROOT, 'output', company, 'pending-lessons.json')).catch(() => {});
    }
    res.json({ ok: true, added: total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Apply approved bank CORRECTIONS — replace an outdated fact with the corrected one in CLAUDE.md.
// Safe: only substitutes when `old` matches EXACTLY ONCE, so it never clobbers the wrong line. A
// correction that matches 0 or many places is reported back for the user to apply by hand.
app.post('/api/apply-corrections', async (req, res) => {
  try {
    const { corrections } = req.body;
    if (!Array.isArray(corrections) || !corrections.length) return res.status(400).json({ error: 'no corrections' });
    const claudePath = path.join(ROOT, 'CLAUDE.md');
    let content = await fs.readFile(claudePath, 'utf8');
    const original = content; // count matches against the ORIGINAL, so an earlier edit can't make a
    const applied = [], skipped = []; // later ambiguous string look unique (or vice versa) mid-loop
    for (const c of corrections) {
      const oldS = (c.old || '').trim(), newS = (c.new || '').trim();
      if (!oldS || !newS) { skipped.push({ ...c, reason: 'empty' }); continue; }
      const count = original.split(oldS).length - 1;
      if (count === 1) { content = content.replace(oldS, newS); applied.push(c); }
      else skipped.push({ ...c, reason: count === 0 ? 'not found verbatim — apply by hand' : 'matches ' + count + ' places — apply by hand' });
    }
    if (applied.length) await fs.writeFile(claudePath, content);
    res.json({ ok: true, applied: applied.length, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log('Jobkit UI running at http://localhost:' + PORT);
  console.log('Project root: ' + ROOT);
});
