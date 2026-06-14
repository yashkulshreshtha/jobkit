const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, BorderStyle, TabStopType } = require('docx');
const mammoth = require('mammoth');

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

const safeName = n => /^[a-z0-9._-]+$/i.test(n);
fs.mkdir(path.join(ROOT, 'output'), { recursive: true }).catch(() => {});

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

function upsertPipelineRow(pipelineContent, name, role, stage, today) {
  const updated = updatePipelineStage(pipelineContent, name, stage);
  if (updated !== pipelineContent) return updated; // found and updated existing row

  // company not in pipeline — add a new row
  const lines = pipelineContent.split('\n');
  const nameDisplay = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const newRow = `| ${nameDisplay} | ${role || '—'} | — | ${stage} | — | — | ${today} |`;
  let lastTableIdx = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('|') && !/^\|[-\s:|]+\|/.test(l)) lastTableIdx = i;
  });
  if (lastTableIdx >= 0) lines.splice(lastTableIdx + 1, 0, newRow);
  else lines.push(newRow);
  return lines.join('\n');
}

function updatePipelineStage(pipelineContent, name, newStage) {
  const pLines = pipelineContent.split('\n');
  const headerLine = pLines.find(l => l.startsWith('|') && !/^\|[-\s:|]+\|/.test(l) && l.toLowerCase().includes('stage'));
  let companyColIdx = -1, stageColIdx = -1;
  if (headerLine) {
    const hCols = headerLine.split('|');
    companyColIdx = hCols.findIndex(c => c.trim().toLowerCase() === 'company');
    stageColIdx   = hCols.findIndex(c => c.trim().toLowerCase() === 'stage');
  }
  const nameVariant = name.replace(/-/g, ' ').toLowerCase();
  return pLines.map(line => {
    if (!line.startsWith('|') || /^\|[-\s:|]+\|/.test(line)) return line;
    const cols = line.split('|');
    const colToCheck = companyColIdx >= 0 ? (cols[companyColIdx] || '') : (cols[1] || '');
    if (stageColIdx >= 0 && colToCheck.trim().toLowerCase().includes(nameVariant)) {
      cols[stageColIdx] = ' ' + newStage + ' ';
      return cols.join('|');
    }
    return line;
  }).join('\n');
}

// --- read-only views -------------------------------------------------------
app.get('/api/pipeline', async (req, res) => {
  try {
    const content = await fs.readFile(path.join(ROOT, 'pipeline.md'), 'utf8');
    res.json({ content });
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
    // parse the machine-readable summary, then strip it from the displayed output
    const m = out.match(/<!--\s*MATCH:\s*verdict=(APPLY|MAYBE|SKIP)\s+score=(\d{1,3})\s*-->/i);
    const verdict = m ? m[1].toUpperCase() : null;
    const score = m ? Math.min(100, parseInt(m[2], 10)) : null;
    const output = out.replace(/<!--\s*MATCH:[\s\S]*?-->/i, '').trim();
    res.json({ output, verdict, score });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/log', async (req, res) => {
  try {
    const { company, note } = req.body;
    if (!company || !note) return res.status(400).json({ error: 'company and note required' });
    const out = await runClaude('/log ' + company + ' ' + note);
    res.json({ output: out });
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

    res.json({ ok: true, entry });
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
    if (content.match(/^- Stage:/m)) {
      content = content.replace(/^(- Stage:.*)/m, '- Stage: Submitted');
    }
    if (content.match(/^- Resume used:/m)) {
      content = content.replace(/^- Resume used:.*/m, '- Resume used: ' + filename);
    }
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
    const entry = `- ${date} | Status: ${outcome || 'Closed'}`;
    content = content.replace(/^- (Tier|Stage):.*/m, match => match);
    if (content.match(/^- Stage:/m)) {
      content = content.replace(/^(- Stage:.*)/m, `- Stage: ${outcome || 'Closed'}`);
    }
    if (content.includes('## Process log')) {
      content = content.replace(/## Process log\n/, `## Process log\n${entry}\n`);
    }
    await fs.writeFile(coPath, content);

    const pipelinePath = path.join(ROOT, 'pipeline.md');
    let pipeline = await fs.readFile(pipelinePath, 'utf8');
    pipeline = updatePipelineStage(pipeline, name, outcome || 'Closed');
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

app.post('/api/rebuild-resume', async (req, res) => {
  try {
    const { resume_data, resume_markdown } = req.body;
    if (!resume_data || !resume_data.slug || !resume_data.date)
      return res.status(400).json({ error: 'resume_data with slug and date required' });
    const coDir = path.join(ROOT, 'output', resume_data.slug);
    await fs.mkdir(coDir, { recursive: true });
    const buildData = resume_markdown
      ? { ...resume_data, sections: serverParseMd(resume_markdown) }
      : resume_data;
    const docxFile = resume_data.slug + '/resume-' + resume_data.slug + '-' + resume_data.date + '.docx';
    const htmlFile = resume_data.slug + '/resume-' + resume_data.slug + '-' + resume_data.date + '.html';
    await fs.writeFile(path.join(ROOT, 'output', docxFile), await buildDocx(buildData));
    await fs.writeFile(path.join(ROOT, 'output', htmlFile), buildPrintHtml(buildData));
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
    const diffSumMatch = out.match(/<!--\s*DIFF_SUMMARY:\s*added=(\d+)\s+modified=(\d+)\s+removed=(\d+)\s*-->/);

    console.log('[/api/run] jsonMatch:', !!jsonMatch, '| savedMatch:', savedMatch ? savedMatch[1] : null);

    let resumeData = null, docxFile = null, htmlFile = null, resumePreview = null;

    if (jsonMatch) {
      try {
        resumeData = JSON.parse(jsonMatch[1].trim());
        const coDir = path.join(ROOT, 'output', resumeData.slug);
        await fs.mkdir(coDir, { recursive: true });
        // Persist the full JD so prep can diff it against the CV later. The JD is otherwise
        // discarded after tailoring — store it the moment we know the company slug.
        if (jd && jd.trim()) {
          const header = `# JD — ${resumeData.jd_title || 'Role'} — ${resumeData.slug}\n_Captured ${resumeData.date}_\n\n`;
          await fs.writeFile(path.join(coDir, 'jd-' + resumeData.date + '.md'), header + jd.trim())
            .catch(e => console.error('[/api/run] JD save error:', e.message));
        }
        docxFile = resumeData.slug + '/resume-' + resumeData.slug + '-' + resumeData.date + '.docx';
        htmlFile = resumeData.slug + '/resume-' + resumeData.slug + '-' + resumeData.date + '.html';
        if (savedMatch) {
          const mdSrc  = path.join(ROOT, savedMatch[1]);
          const mdDest = path.join(ROOT, 'output', resumeData.slug,
            'resume-' + resumeData.slug + '-' + resumeData.date + '.md');
          try {
            const mdContent = await fs.readFile(mdSrc, 'utf8');
            await fs.writeFile(mdDest, mdContent);
            await fs.unlink(mdSrc).catch(() => {});
            resumePreview = mdContent;
            resumeData.sections = serverParseMd(mdContent);
          } catch (e) { console.error('[/api/run] md move error:', e.message); }
        }
        await fs.writeFile(path.join(ROOT, 'output', docxFile), await buildDocx(resumeData));
        await fs.writeFile(path.join(ROOT, 'output', htmlFile), buildPrintHtml(resumeData));
        // auto-create company file if it doesn't exist yet
        const coFile = path.join(ROOT, 'companies', resumeData.slug + '.md');
        try {
          await fs.access(coFile);
        } catch (e) {
          const stub = `# ${resumeData.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — ${resumeData.jd_title || 'Role'}\n\n- Stage: Tailored\n- Resume used: resume-${resumeData.slug}-${resumeData.date}.docx\n\n## Process log\n\n## Resumes sent\n`;
          await fs.writeFile(coFile, stub);
        }
      } catch (e) { console.error('[/api/run] Build error:', e.message); }
    }

    // fallback 1: read .md directly from SAVED marker path
    if (!resumePreview && savedMatch) {
      try {
        resumePreview = await fs.readFile(path.join(ROOT, savedMatch[1]), 'utf8');
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
          console.log('[/api/run] resumePreview loaded via scan fallback:', candidates[0].name, 'length:', resumePreview.length);
        }
      } catch (e) { console.log('[/api/run] scan fallback failed:', e.message); }
    }

    console.log('[/api/run] resumePreview length:', resumePreview ? resumePreview.length : 0);

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

    res.json({
      output:         clean,
      resume_preview: resumePreview,
      resume_data:    resumeData,
      diff_data:      diffData,
      diff_summary:   diffSummary,
      docx_file:      docxFile,
      html_file:      htmlFile,
      saved_cover:    savedCL ? savedCL[1] : null,
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

    // delete all prior generated resume files (drafts) — uploaded file is the source of truth
    try {
      const existing = await fs.readdir(coDir);
      await Promise.all(
        existing
          .filter(f => f !== safeFname && /^resume-/.test(f) && /\.(docx|html|md)$/.test(f))
          .map(f => fs.unlink(path.join(coDir, f)).catch(() => {}))
      );
    } catch (e) {}

    await fs.writeFile(path.join(coDir, safeFname), buf);

    // extract text from DOCX and save as canonical .md — fast, no Claude needed
    let extracted = false;
    if (ext === 'docx') {
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        const text = result.value.trim();
        if (text) {
          await fs.writeFile(path.join(coDir, safeFname.replace(/\.docx$/i, '.md')), text);
          extracted = true;
        }
      } catch (e) {
        console.error('[upload-sent] mammoth error:', e.message);
      }
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
    if (content.match(/^- Stage:/m)) {
      content = content.replace(/^(- Stage:.*)/m, '- Stage: Submitted');
    }
    // point "Resume used:" at the file actually submitted (uploaded separately, usually a PDF)
    if (content.match(/^- Resume used:/m)) {
      content = content.replace(/^- Resume used:.*/m, '- Resume used: ' + safeFname);
    }
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

    // read the most recently saved .md for this company
    const coDir = path.join(ROOT, 'output', company);
    let resumeText = null;
    try {
      const files = await fs.readdir(coDir);
      const mds = files.filter(f => f.endsWith('.md')).sort().reverse();
      if (mds.length) resumeText = (await fs.readFile(path.join(coDir, mds[0]), 'utf8')).trim();
    } catch (e) {}

    if (!resumeText) return res.json({ new_bullets: [] });

    const prompt = `Read CLAUDE.md, specifically the achievement bank section. Then compare it against this submitted resume:\n\n---\n${resumeText.substring(0, 4000)}\n---\n\nIdentify achievement bullets, facts, or phrasings in the resume that are NOT already in the achievement bank and are worth adding for future tailoring. Only genuinely new facts — not rephrased versions of existing bullets. Return raw JSON only, no markdown fences: {"new_bullets":["bullet1","bullet2"]}. If nothing is new, return {"new_bullets":[]}.`;
    const out = await runClaude(prompt);
    const m = out.match(/\{[\s\S]*?\}/);
    if (!m) return res.json({ new_bullets: [] });
    try {
      const parsed = JSON.parse(m[0]);
      res.json({ new_bullets: Array.isArray(parsed.new_bullets) ? parsed.new_bullets : [] });
    } catch { res.json({ new_bullets: [] }); }
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

app.listen(PORT, () => {
  console.log('Jobkit UI running at http://localhost:' + PORT);
  console.log('Project root: ' + ROOT);
});
