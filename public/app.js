const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const statusEl = $('#status');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const tab = document.querySelector('.tab[data-tab="' + tabName + '"]');
  const panel = document.getElementById('panel-' + tabName);
  if (tab) tab.classList.add('active');
  if (panel) panel.classList.add('active');
}
let busy = false;
let _resumeData = null;
let _diffData = null;
let _diffVisible = false;
let _progressTimer = null;
let _resumeMarkdown = null;
let _pipelineRows = [];
let _pipelineStrategy = '';
let _pipelineFooter = '';
let _pipelineFilter = 'all';
let _pipelineSort = 'updated';
let _pipelineSearch = '';
let _calMonth = null;       // {y, m} currently-shown calendar month; null until first render picks a default
let _interviewEvents = {};  // { slug: [{date, label}] } past interviews mined from company logs (server)
let _appliedDates = {};     // { slug: 'YYYY-MM-DD' } from company files, for CSV export
let _activeJdText = '';

function setStatus(text, cls) {
  const dot = document.getElementById('status-dot');
  if (!dot) return;
  dot.className = 'status-dot' + (cls ? ' ' + cls : '');
  dot.title = text;
}
function setBusy(on, label) {
  busy = on;
  $$('.primary').forEach(b => b.disabled = on);
  setStatus(on ? (label || 'running…') : 'ready', on ? 'busy' : '');
}

// tab switching
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#panel-' + t.dataset.tab).classList.add('active');
}));

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// markdown render
function render(target, md) {
  $(target).innerHTML = marked.parse(md || '');
}

// PIPELINE
function stageBadgeClass(stage) {
  const s = (stage || '').toLowerCase();
  switch (stageCategory(stage)) {
    case 'offer': return 'green';
    case 'closed': return /reject|declined/.test(s) ? 'red' : 'gray';
    case 'interviewing': return 'blue';
    case 'screening': return 'amber';
    case 'submitted': return 'teal';
    default: return 'gray';
  }
}

// Short label for the stage badge — the free-text Stage can carry a long scheduling tail
// (e.g. "1st interview confirmed — Talent Talk Tue 21.07 13:30–14:00 (Berlin)") that overflows
// the card. Drop the "confirmed — <when>" detail (it's already in the calendar + Next line);
// keep the round. Everything else is already short/canonical, returned as-is.
function shortStage(stage) {
  const s = (stage || '').trim();
  const m = s.match(/^(.*?interview)\s+confirmed\b/i);   // "Nth interview confirmed — …" → "Nth interview"
  return m ? m[1].trim() : s;
}

// Single-funnel stage grouping: each company sits in exactly one current stage.
// Order matters — assessments are caught before generic "interview"; recruiter calls count as interviewing.
function stageCategory(stage) {
  const s = (stage || '').toLowerCase();
  if (/offer/.test(s)) return 'offer';
  if (/reject|declined|closed|filled|withdr/.test(s)) return 'closed';
  if (/screen|assessment|take-?home|profile|coding test|online test|exam/.test(s)) return 'screening';
  if (/round|interview|technical|onsite|panel|hiring manager|final|loop|recruiter/.test(s)) return 'interviewing';
  if (/submitted|applied|waiting|pending|awaiting/.test(s)) return 'submitted';
  return 'other';
}

// Whole days between a YYYY-MM-DD date and today. null if unparseable.
function daysSince(dateStr) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return null;
  const then = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(then)) return null;
  const today = new Date();
  return Math.floor((today - then) / 86400000);
}

// A row is "stale" when it's still Submitted (no response yet) and hasn't moved in 30+ days.
const STALE_DAYS = 30;
function staleDays(row) {
  if (stageCategory(row['stage']) !== 'submitted') return null;
  const d = daysSince(row['updated']);
  return d !== null && d >= STALE_DAYS ? d : null;
}

// ── INTERVIEW CALENDAR ────────────────────────────────────────────────────────
// Interview dates aren't a structured field — they live as free text in the Stage column
// (e.g. "1st interview confirmed — Mon 20.07 13:30"). Parse a DD.MM [HH:MM] out of the Stage
// (falling back to Next action) for rows that are actually at an interview stage. Any row without
// a parseable date is SKIPPED — never guess a date. Year comes from the date itself, else the
// row's Updated year, else the current year.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function parseInterviewEvents(rows) {
  const events = [];
  (rows || []).forEach(r => {
    const stage = r['stage'] || '';
    if (stageCategory(stage) !== 'interviewing') return;
    const text = stage + '  ' + (r['next action'] || '');
    const dm = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/.exec(text);
    if (!dm) return;
    const day = +dm[1], month = +dm[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    let year;
    if (dm[3]) year = dm[3].length === 2 ? 2000 + +dm[3] : +dm[3];
    else { const um = /(\d{4})-\d{2}-\d{2}/.exec(r['updated'] || ''); year = um ? +um[1] : new Date().getFullYear(); }
    const date = new Date(year, month - 1, day);
    if (isNaN(date)) return;
    const tm = /\b(\d{1,2}):(\d{2})(?:\s*[–\-]\s*(\d{1,2}):(\d{2}))?/.exec(text);
    const time = tm ? (tm[1].padStart(2, '0') + ':' + tm[2] + (tm[3] ? '–' + tm[3].padStart(2, '0') + ':' + tm[4] : '')) : '';
    events.push({
      y: year, m: month - 1, d: day, key: year + '-' + (month - 1) + '-' + day,
      company: r['company'] || '', role: r['role'] || '', stage, time,
      slug: slugify(r['company'] || ''), badge: stageBadgeClass(stage),
    });
  });
  return events;
}

// All interview events for the calendar: UPCOMING ones parsed from the pipeline Stage (above) +
// PAST ones mined from company logs server-side (_interviewEvents) — the latter are how a completed/
// rejected interview like checkmk still appears after its date left the Stage. Deduped by company+day.
function collectEvents(rows) {
  const byKey = new Map();
  const put = e => { const k = e.slug + '|' + e.y + '-' + e.m + '-' + e.d; if (!byKey.has(k)) byKey.set(k, e); };
  parseInterviewEvents(rows).forEach(put);
  const rowBySlug = {};
  (rows || []).forEach(r => { rowBySlug[slugify(r['company'] || '')] = r; });
  Object.entries(_interviewEvents || {}).forEach(([slug, evs]) => {
    (evs || []).forEach(ev => {
      const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(ev.date || '');
      if (!dm) return;
      const row = rowBySlug[slug] || {};
      put({
        y: +dm[1], m: +dm[2] - 1, d: +dm[3],
        company: row['company'] || slug.replace(/-/g, ' '), role: row['role'] || '', slug,
        stage: row['stage'] || '', time: '', label: ev.label || 'interview',
        badge: stageBadgeClass(row['stage'] || 'gray'),
      });
    });
  });
  return [...byKey.values()];
}

// Build the month-grid calendar HTML for the currently-selected month (_calMonth), with event
// chips on the days that have interviews. Monday-first (European). Returns an HTML string.
function renderCalendar(rows) {
  const events = collectEvents(rows);
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();

  // First render: default to the month of the next upcoming interview, else the latest one, else this month.
  if (!_calMonth) {
    const upcoming = events
      .map(e => ({ e, t: new Date(e.y, e.m, e.d).getTime() }))
      .filter(x => x.t >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime())
      .sort((a, b) => a.t - b.t)[0];
    const latest = events.map(e => ({ e, t: new Date(e.y, e.m, e.d).getTime() })).sort((a, b) => b.t - a.t)[0];
    const pick = (upcoming || latest || null);
    _calMonth = pick ? { y: pick.e.y, m: pick.e.m } : { y: today.getFullYear(), m: today.getMonth() };
  }
  const { y, m } = _calMonth;

  // group events by day-of-month for this shown month
  const byDay = {};
  events.filter(e => e.y === y && e.m === m).forEach(e => { (byDay[e.d] = byDay[e.d] || []).push(e); });
  const monthCount = Object.values(byDay).reduce((n, a) => n + a.length, 0);

  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const cellKey = y + '-' + m + '-' + d;
    const isToday = cellKey === todayKey;
    const isPast = new Date(y, m, d).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const evs = byDay[d] || [];
    const chips = evs.map(e => {
      const sub = e.time || e.label || '';
      return `<button class="cal-event ${e.badge}" data-slug="${e.slug}" type="button" title="${(e.company + (e.stage ? ' — ' + e.stage : '')).replace(/"/g, '&quot;')}">
         ${sub ? `<span class="cal-event-t">${sub}</span>` : ''}<span class="cal-event-c">${e.company}</span>
       </button>`;
    }).join('');
    cells += `<div class="cal-cell${isToday ? ' cal-today' : ''}${isPast ? ' cal-past' : ''}${evs.length ? ' cal-has' : ''}">
      <span class="cal-daynum">${d}</span>${chips}</div>`;
  }

  const caption = monthCount
    ? `${monthCount} interview${monthCount > 1 ? 's' : ''} this month`
    : 'No interviews this month';

  return `<div class="cal" id="pl-calendar">
    <div class="cal-head">
      <div class="cal-title">📅 ${MONTHS[m]} ${y} <span class="cal-caption">· ${caption}</span></div>
      <div class="cal-nav">
        <button class="cal-btn" id="cal-prev" type="button" aria-label="Previous month">‹</button>
        <button class="cal-btn cal-today-btn" id="cal-today" type="button">Today</button>
        <button class="cal-btn" id="cal-next" type="button" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="cal-grid cal-dow">
      ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="cal-dowc">${d}</div>`).join('')}
    </div>
    <div class="cal-grid cal-days">${cells}</div>
  </div>`;
}

// Wire the calendar's month-nav + event chips. Called from renderPipelineView's bind section.
function bindCalendar(container) {
  const prev = container.querySelector('#cal-prev');
  const next = container.querySelector('#cal-next');
  const todayBtn = container.querySelector('#cal-today');
  const step = delta => {
    if (!_calMonth) return;
    let m = _calMonth.m + delta, y = _calMonth.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    _calMonth = { y, m };
    renderPipelineView();
  };
  if (prev) prev.addEventListener('click', () => step(-1));
  if (next) next.addEventListener('click', () => step(1));
  if (todayBtn) todayBtn.addEventListener('click', () => {
    const t = new Date();
    _calMonth = { y: t.getFullYear(), m: t.getMonth() };
    renderPipelineView();
  });
  container.querySelectorAll('.cal-event[data-slug]').forEach(chip => {
    chip.addEventListener('click', () => {
      const slug = chip.dataset.slug;
      switchToTab('companies');
      setTimeout(() => {
        const coCard = document.querySelector('.co-card[data-name="' + slug + '"]');
        if (coCard) coCard.click(); else activateCompany(slug);
      }, 50);
    });
  });
}

function renderPipeline(md) {
  const container = document.getElementById('pipeline-view');
  const lines = md.split('\n');
  const isTableRow = l => /^\|/.test(l.trim());
  const isSeparator = l => /^\|[-\s:|]+\|/.test(l.trim());
  const tableLines = lines.filter(l => isTableRow(l) && !isSeparator(l));

  if (!tableLines.length) { container.innerHTML = marked.parse(md); return; }

  const headers = tableLines[0].split('|').map(s => s.trim()).filter(Boolean);
  const rows = tableLines.slice(1).map(line => {
    const cells = line.split('|').map(s => s.trim()).filter(Boolean);
    const obj = {};
    headers.forEach((h, i) => { obj[h.toLowerCase()] = cells[i] || ''; });
    return obj;
  });

  let firstTableIdx = lines.findIndex(l => isTableRow(l));
  let lastTableIdx = -1;
  lines.forEach((l, i) => { if (isTableRow(l)) lastTableIdx = i; });

  _pipelineStrategy = lines.slice(0, firstTableIdx)
    .filter(l => l.trim() && !/^#/.test(l.trim())).join(' ').trim();
  _pipelineFooter = lines.slice(lastTableIdx + 1)
    .filter(l => l.trim() && !/^#/.test(l.trim())).join(' ').trim();
  _pipelineRows = rows;
  renderPipelineView();
}

// Re-renders the pipeline from cached rows applying current filter/sort/search.
function renderPipelineView() {
  const container = document.getElementById('pipeline-view');
  const rows = _pipelineRows;

  // counts by current stage (mutually exclusive)
  const counts = { all: rows.length, submitted: 0, screening: 0, interviewing: 0, offer: 0, closed: 0 };
  rows.forEach(r => {
    const cat = stageCategory(r['stage']);
    if (counts[cat] !== undefined) counts[cat]++;
  });

  let html = `<div class="pl-stats">
    <div class="pl-stat"><span class="pl-stat-n">${counts.all}</span><span class="pl-stat-l">Total</span></div>
    <div class="pl-stat"><span class="pl-stat-n teal">${counts.submitted}</span><span class="pl-stat-l">Submitted</span></div>
    <div class="pl-stat"><span class="pl-stat-n amber">${counts.screening}</span><span class="pl-stat-l">Screening</span></div>
    <div class="pl-stat"><span class="pl-stat-n blue">${counts.interviewing}</span><span class="pl-stat-l">Interviewing</span></div>
    <div class="pl-stat"><span class="pl-stat-n green">${counts.offer}</span><span class="pl-stat-l">Offers</span></div>
    <div class="pl-stat"><span class="pl-stat-n muted">${counts.closed}</span><span class="pl-stat-l">Closed</span></div>
  </div>`;

  if (_pipelineStrategy) {
    html += `<div class="pl-strategy">${_pipelineStrategy.replace(/(Jun.?Aug|late Sep[a-z]*)/gi, '<strong>$1</strong>')}</div>`;
  }

  const filters = [['all','All'],['submitted','Submitted'],['screening','Screening'],['interviewing','Interviewing'],['offer','Offers'],['closed','Closed']];
  html += `<div class="pl-controls">
    <div class="pl-filters">${filters.map(([k, label]) =>
      `<button class="pl-chip${_pipelineFilter === k ? ' active' : ''}" data-filter="${k}">${label}</button>`).join('')}</div>
    <div class="pl-tools">
      <input id="pl-search" class="pl-search" type="text" placeholder="Search company or role…" value="${_pipelineSearch.replace(/"/g, '&quot;')}">
      <select id="pl-sort" class="pl-sort">
        <option value="updated"${_pipelineSort === 'updated' ? ' selected' : ''}>Recently updated</option>
        <option value="company"${_pipelineSort === 'company' ? ' selected' : ''}>Company A–Z</option>
        <option value="stage"${_pipelineSort === 'stage' ? ' selected' : ''}>Stage</option>
      </select>
      <button id="pl-export" class="pl-export" type="button" title="Export all applications as a CSV (for AFA / records)">⭳ Export CSV</button>
    </div>
  </div>`;

  // apply filter + search
  let view = rows.slice();
  if (_pipelineFilter !== 'all') {
    view = view.filter(r => stageCategory(r['stage']) === _pipelineFilter);
  }
  if (_pipelineSearch.trim()) {
    const q = _pipelineSearch.trim().toLowerCase();
    view = view.filter(r => ((r['company'] || '') + ' ' + (r['role'] || '')).toLowerCase().includes(q));
  }

  // sort
  const stageOrder = { offer: 0, interviewing: 1, screening: 2, submitted: 3, other: 4, closed: 5 };
  view.sort((a, b) => {
    if (_pipelineSort === 'company') return (a['company'] || '').localeCompare(b['company'] || '');
    if (_pipelineSort === 'stage') return stageOrder[stageCategory(a['stage'])] - stageOrder[stageCategory(b['stage'])];
    return (b['updated'] || '').localeCompare(a['updated'] || ''); // updated desc
  });

  html += '<div class="pl-list">';
  if (!view.length) html += '<div class="pl-empty">No matches.</div>';
  view.forEach(row => {
    const company = row['company'] || '';
    const role    = row['role'] || '';
    const stage   = row['stage'] || '';
    const next    = row['next action'] || '';
    const updated = row['updated'] || '';
    const tier    = row['tier'] || '';
    const badge   = stageBadgeClass(stage);
    const tierSpan = tier && tier !== '—' ? `<span class="pl-tier">${tier}</span>` : '';
    const nextLine = next && next !== '—' ? `<div class="pl-next"><span class="pl-next-label">Next</span> ${next}</div>` : '';
    const stale   = staleDays(row);
    const staleLine = stale !== null
      ? `<div class="pl-stale">stale · ${stale}d no response
           <button class="pl-close-btn" data-slug="${slugify(company)}" type="button">Close</button>
         </div>`
      : '';

    html += `<div class="pl-row${stale !== null ? ' is-stale' : ''}" data-slug="${slugify(company)}" role="button" tabindex="0">
      <div class="pl-main">
        <div class="pl-co">${company}${tierSpan}</div>
        <div class="pl-role">${role}</div>
        ${nextLine}
        ${staleLine}
      </div>
      <div class="pl-side">
        <span class="stage-badge ${badge}" title="${stage.replace(/"/g, '&quot;')}">${shortStage(stage)}</span>
        ${updated ? `<span class="pl-updated">${updated}</span>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';                                          // close .pl-list

  if (_pipelineFooter) html += `<div class="pipeline-footer">${_pipelineFooter}</div>`;

  // interview calendar — full width at the bottom, below the list (independent of filter/search)
  html += renderCalendar(rows);

  container.innerHTML = html;

  // bind controls
  bindCalendar(container);
  container.querySelectorAll('.pl-chip').forEach(chip =>
    chip.addEventListener('click', () => { _pipelineFilter = chip.dataset.filter; renderPipelineView(); }));
  const sortEl = container.querySelector('#pl-sort');
  if (sortEl) sortEl.addEventListener('change', () => { _pipelineSort = sortEl.value; renderPipelineView(); });
  const exportEl = container.querySelector('#pl-export');
  if (exportEl) exportEl.addEventListener('click', exportPipelineCsv);
  const searchEl = container.querySelector('#pl-search');
  if (searchEl) searchEl.addEventListener('input', () => {
    _pipelineSearch = searchEl.value;
    renderPipelineView();
    const el = document.getElementById('pl-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  });

  // stale "Close" button → close as "no response" (won't trigger the card navigation)
  container.querySelectorAll('.pl-close-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      if (!window.confirm('Close this application as "no response"?')) return;
      btn.disabled = true;
      try {
        await api('/api/companies/' + encodeURIComponent(slug) + '/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome: 'no response' })
        });
        await loadPipeline();
      } catch (err) {
        btn.disabled = false;
        setStatus('Close error: ' + err.message, 'error');
      }
    });
  });

  // row click → company tab
  container.querySelectorAll('.pl-row[data-slug]').forEach(card => {
    const go = () => {
      switchToTab('companies');
      setTimeout(() => {
        const slug = card.dataset.slug;
        const coCard = document.querySelector('.co-card[data-name="' + slug + '"]');
        if (coCard) coCard.click();
        else activateCompany(slug);
      }, 50);
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// Export the full pipeline (all rows, ignoring the on-screen filter) as a CSV for
// AFA / personal records. Built client-side from the already-parsed rows.
function exportPipelineCsv() {
  const cols = [
    ['company',      'Company'],
    ['role',         'Role'],
    ['tier',         'Tier'],
    ['stage',        'Status'],
    ['warm contact', 'Contact'],
    ['applied',      'Date applied'],
    ['next action',  'Next action'],
    ['updated',      'Last updated'],
  ];
  const rows = _pipelineRows || [];
  if (!rows.length) { alert('No applications to export yet.'); return; }

  const SEP = ';'; // semicolon → opens cleanly in German Excel and Google Sheets
  const clean = v => (v == null ? '' : String(v).replace(/^—$/, '').trim());
  const esc = v => {
    const s = clean(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // real "date applied" comes from the company file; fall back to last-updated
  const cell = (r, key) => key === 'applied'
    ? (_appliedDates[slugify(r['company'] || '')] || r['updated'] || '')
    : r[key];

  const lines = [cols.map(c => esc(c[1])).join(SEP)];
  rows.forEach(r => lines.push(cols.map(c => esc(cell(r, c[0]))).join(SEP)));
  const csv = '﻿' + lines.join('\r\n'); // BOM + CRLF for Excel/umlauts

  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `applications-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

async function loadPipeline() {
  try {
    const { content, appliedDates, interviewEvents } = await api('/api/pipeline');
    _appliedDates = appliedDates || {};
    _interviewEvents = interviewEvents || {};
    renderPipeline(content);
    // Pipeline rows feed the Companies sidebar stage badges — refresh it now that they're loaded.
    if (_companyNames.length) renderCompanyList();
  } catch (e) {
    document.getElementById('pipeline-view').textContent = 'Error: ' + e.message;
  }
}
$('#pipeline-refresh').addEventListener('click', loadPipeline);

// COMPANIES
async function loadCompanies() {
  try {
    const { names } = await api('/api/companies');
    const companies = names.filter(n => !/(-(prep|notes|backup|kb))$/.test(n));

    const opts = companies.map(n =>
      `<option value="${n}">${n.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`
    ).join('');
    const prepSel = document.getElementById('prep-company');
    const logSel  = document.getElementById('log-company-existing');
    // Preserve the current selection — rebuilding innerHTML otherwise snaps the
    // dropdown back to the first option (alphabetically Deutsche Bank).
    const prepPrev = prepSel && prepSel.value;
    const logPrev  = logSel && logSel.value;
    if (prepSel) { prepSel.innerHTML = opts; if (prepPrev) prepSel.value = prepPrev; }
    if (logSel)  { logSel.innerHTML  = '<option value="">— pick —</option>' + opts; if (logPrev) logSel.value = logPrev; }

    _companyNames = companies;
    renderCompanyList();

    const toSelect = window._activeCompany && companies.includes(window._activeCompany)
      ? window._activeCompany : companies[0];
    if (toSelect) activateCompany(toSelect);

  } catch(e) { console.error('loadCompanies error:', e); }
}

let _companyNames = [];
let _companySearch = '';

// Look up a company's current stage from the cached pipeline rows (for the sidebar badge).
function companyStage(slug) {
  const row = (_pipelineRows || []).find(r => slugify(r['company'] || '') === slug);
  return row ? (row['stage'] || '') : '';
}

function renderCompanyList() {
  const list = document.getElementById('company-list');
  if (!list) return;
  list.className = 'co-list';
  const q = _companySearch.trim().toLowerCase();
  const shown = _companyNames.filter(n => !q || n.replace(/-/g, ' ').toLowerCase().includes(q));
  if (!_companyNames.length) {
    list.innerHTML = '<p class="co-empty">No companies yet. Use Intake to add one.</p>';
    return;
  }
  if (!shown.length) { list.innerHTML = '<p class="co-empty">No matches.</p>'; return; }
  list.innerHTML = shown.map(n => {
    const stage = companyStage(n);
    const badge = stage ? `<span class="co-card-stage stage-badge ${stageBadgeClass(stage)}">${stageCategory(stage)}</span>` : '';
    return `<div class="co-card${n === window._activeCompany ? ' active' : ''}" data-name="${n}" role="button" tabindex="0">
      <div class="co-card-name">${n.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
      ${badge}
    </div>`;
  }).join('');
  list.querySelectorAll('.co-card').forEach(card => {
    card.addEventListener('click', () => activateCompany(card.dataset.name));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') activateCompany(card.dataset.name); });
  });
}

function activateCompany(name) {
  if (name !== window._activeCompany) {
    document.getElementById('upload-form').hidden = true;
    document.getElementById('upload-resume-toggle').hidden = false;
    document.getElementById('upload-file').value = '';
    document.getElementById('file-pick-label').textContent = 'Choose file…';
    document.getElementById('file-pick-label').classList.remove('has-file');
    document.getElementById('upload-status').hidden = true;
    document.getElementById('context-review').hidden = true;
    document.getElementById('context-bullets-list').innerHTML = '';
    document.getElementById('context-add-status').textContent = '';
  }
  window._activeCompany = name;
  document.querySelectorAll('.co-card').forEach(c => {
    c.classList.toggle('active', c.dataset.name === name);
  });
  loadCompany(name);
}

async function loadPendingLessons(name) {
  const panel = document.getElementById('pending-lessons-panel');
  const list = document.getElementById('pending-lessons-list');
  const status = document.getElementById('pending-lessons-status');
  if (!panel || !list) return;
  status.textContent = '';
  let data = null;
  try { data = await api('/api/pending-lessons/' + encodeURIComponent(name)); } catch (e) {}
  const groups = {
    interview: (data && data.interview_lessons) || [],
    tailoring: (data && data.tailoring_lessons) || [],
    apply_skip: (data && data.apply_skip_lessons) || [],
  };
  const total = groups.interview.length + groups.tailoring.length + groups.apply_skip.length;
  if (!total) { panel.hidden = true; return; }
  const labels = { interview: 'Interview lessons (→ /prep)', tailoring: 'Tailoring lessons (→ /tailor)', apply_skip: 'Apply/skip lessons (→ /tailor-analyse)' };
  const section = key => groups[key].length ? `
    <div>
      <div class="section-sublabel" style="margin-top:0;font-size:12px">${labels[key]}</div>
      ${groups[key].map((l, i) => `
        <label class="context-bullet-row">
          <input type="checkbox" class="pending-cb" data-group="${key}" data-idx="${i}" checked />
          <span>${escapeHtml(l)}</span>
        </label>`).join('')}
    </div>` : '';
  list.innerHTML = section('interview') + section('tailoring') + section('apply_skip');
  list._groups = groups;
  panel._company = name;
  panel.hidden = false;
}

document.getElementById('pending-lessons-apply').addEventListener('click', async () => {
  const panel = document.getElementById('pending-lessons-panel');
  const list = document.getElementById('pending-lessons-list');
  const status = document.getElementById('pending-lessons-status');
  const groups = list._groups || { interview: [], tailoring: [], apply_skip: [] };
  const pick = key => Array.from(list.querySelectorAll('.pending-cb[data-group="' + key + '"]:checked'))
    .map(cb => groups[key][parseInt(cb.dataset.idx)]);
  const interview_lessons = pick('interview'), tailoring_lessons = pick('tailoring'), apply_skip_lessons = pick('apply_skip');
  if (!interview_lessons.length && !tailoring_lessons.length && !apply_skip_lessons.length) {
    status.style.color = 'var(--muted)'; status.textContent = 'Nothing checked.'; return;
  }
  try {
    setBusy(true, 'updating CLAUDE.md…');
    const r = await api('/api/add-routed-lessons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: panel._company, interview_lessons, tailoring_lessons, apply_skip_lessons }),
    });
    status.style.color = 'var(--muted)';
    status.textContent = '✓ ' + r.added + ' lesson(s) added to CLAUDE.md';
    panel.hidden = true; // server cleared the staged file
  } catch (e) {
    status.style.color = 'var(--red)'; status.textContent = 'Error: ' + e.message;
  } finally { setBusy(false); }
});
document.getElementById('pending-lessons-dismiss').addEventListener('click', () => {
  document.getElementById('pending-lessons-panel').hidden = true;
});

async function loadCompany(name) {
  const detail   = document.getElementById('company-detail');
  const nameEl   = document.getElementById('company-detail-name');
  const view     = document.getElementById('company-view');
  const editArea = document.getElementById('company-edit-area');

  if (detail) detail.hidden = false;
  if (nameEl) nameEl.textContent =
    name.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());

  let companyContent = '';
  try {
    const { content } = await api('/api/companies/' + encodeURIComponent(name));
    companyContent = content || '';
    if (view) view.innerHTML = marked.parse(companyContent);
    if (editArea) editArea.value = companyContent;
    // Current-application summary: role + stage from the top-level fields, plus a count
    // of how many applications this company holds (so a 2nd application reads clearly).
    const sub = document.getElementById('company-detail-sub');
    if (sub) {
      const role  = (companyContent.match(/^- Role:\s*(.+)$/m)  || [])[1];
      const stage = (companyContent.match(/^- Stage:\s*(.+)$/m) || [])[1];
      const appCount = (companyContent.match(/^### \d{4}-\d{2}-\d{2} /gm) || []).length;
      const parts = [];
      if (role) parts.push(`<span class="co-sub-role">${role.trim()}</span>`);
      if (stage) parts.push(`<span class="stage-badge ${stageBadgeClass(stage)}">${stage.trim()}</span>`);
      if (appCount > 1) parts.push(`<span class="co-sub-count">${appCount} applications</span>`);
      sub.innerHTML = parts.join(' ');
      sub.hidden = !parts.length;
    }
  } catch(e) {
    if (view) view.textContent = 'Could not load company file: ' + e.message;
    return;
  }

  loadPendingLessons(name); // surface any auto-learned outcome lessons awaiting approval

  const section  = document.getElementById('company-files-section');
  const fileList = document.getElementById('company-files-list');
  try {
    const { files } = await api('/api/companies/' + encodeURIComponent(name) + '/files');
    // filenames listed under "## Resumes sent" in the company file are the actually-submitted ones
    const sentBlock = (companyContent.split(/##\s+Resumes sent/i)[1] || '');
    const isSent = f => sentBlock.includes(f);

    // group files by purpose (the JD has its own panel above, so skip jd-*)
    const groups = { resume: [], cover: [], prep: [] };
    (files || []).forEach(f => {
      const n = f.toLowerCase();
      if (/^jd-/.test(n)) return;
      if (/cover[\s_-]*letter/.test(n)) groups.cover.push(f);
      else if (/^prep-/.test(n)) groups.prep.push(f);
      else groups.resume.push(f);
    });

    const fileRow = f => {
      const ext = f.split('.').pop().toLowerCase();
      const dlUrl = '/api/outputs/' + encodeURIComponent(name) + '/' + encodeURIComponent(f);
      const sent = isSent(f) ? ' <span class="file-badge">submitted</span>' : '';
      return `<div class="file-row">
        <span>
          <span class="file-ext-${ext}">${ext}</span>
          <span class="file-name">${f}</span>${sent}
        </span>
        <a class="btn-dl btn-sm" href="${dlUrl}" download="${f}">↓</a>
      </div>`;
    };

    const sections = [
      ['resume', 'Resumes'],
      ['cover',  'Cover letters'],
      ['prep',   'Interview prep'],
    ];
    const html = sections
      .filter(([k]) => groups[k].length)
      .map(([k, label]) =>
        `<div class="section-sublabel">${label}</div>
         <div class="files-list" style="margin-bottom:14px">${groups[k].map(fileRow).join('')}</div>`)
      .join('');

    if (html && section && fileList) {
      fileList.innerHTML = html;
      section.hidden = false;
    } else if (section) {
      section.hidden = true;
    }
  } catch(e) {
    if (section) section.hidden = true;
  }

  // Captured job description (from the latest tailor run)
  const jdSection = document.getElementById('company-jd-section');
  const jdBody    = document.getElementById('company-jd-body');
  const jdMeta    = document.getElementById('company-jd-meta');
  const jdDetails = jdSection && jdSection.querySelector('.jd-details');
  try {
    const { content } = await api('/api/companies/' + encodeURIComponent(name) + '/jd');
    const raw  = content || '';
    // strip our "# JD — … / _Captured …_" header lines from the displayed body
    const body = raw.replace(/^#[^\n]*\n+(_[^\n]*_\n+)?/, '').trim();
    const bareUrl = body.match(/^(https?:\/\/\S+)$/);
    // "incomplete" = nothing usable was captured: empty, a bare link, or a stub
    const incomplete = !body || !!bareUrl || body.length < 40;
    if (!incomplete) {
      _activeJdText = body;
      if (jdBody) jdBody.innerHTML = marked.parse(body);
      const m = raw.match(/Captured\s+(\d{4})-?(\d{2})-?(\d{2})/);
      if (jdMeta) jdMeta.textContent = m ? `· captured ${m[1]}-${m[2]}-${m[3]}` : '';
      if (jdSection) jdSection.hidden = false;
    } else {
      _activeJdText = '';
      const link = bareUrl ? bareUrl[1] : '';
      if (jdBody) jdBody.innerHTML = `
        <div class="jd-missing">
          <p class="jd-missing-msg">⚠ The full job description wasn't captured${link ? ' — only a link was saved' : ''}. ${link ? `<a href="${link}" target="_blank" rel="noopener">Open the posting ↗</a> · ` : ''}Paste the JD text so /prep and /tailor can ground on it.</p>
          <textarea id="jd-paste-area" class="jd-paste-area" rows="7" placeholder="Paste the full job description here…"></textarea>
          <div class="row" style="margin-top:8px">
            <button class="primary btn-sm" id="jd-paste-save" data-name="${name}">Save JD</button>
            <span id="jd-paste-status" class="hint" style="margin-left:8px"></span>
          </div>
        </div>`;
      if (jdMeta) jdMeta.textContent = '· not captured';
      if (jdSection) jdSection.hidden = false;
      if (jdDetails) jdDetails.open = true; // surface the warning without a click
      const saveBtn = document.getElementById('jd-paste-save');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        const ta = document.getElementById('jd-paste-area');
        const status = document.getElementById('jd-paste-status');
        const txt = ((ta && ta.value) || '').trim();
        if (txt.length < 40) { if (status) { status.style.color = 'var(--red)'; status.textContent = 'Paste the full JD text.'; } return; }
        saveBtn.disabled = true;
        try {
          await api('/api/companies/' + encodeURIComponent(saveBtn.dataset.name) + '/jd', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jd: txt })
          });
          await loadCompany(saveBtn.dataset.name);
        } catch (e) {
          saveBtn.disabled = false;
          if (status) { status.style.color = 'var(--red)'; status.textContent = 'Error: ' + e.message; }
        }
      });
    }
  } catch(e) {
    _activeJdText = '';
    if (jdSection) jdSection.hidden = true;
  }
}

document.getElementById('company-jd-copy').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!_activeJdText) return;
  try {
    await navigator.clipboard.writeText(_activeJdText);
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch (err) { setStatus('Copy failed', 'error'); }
});

document.getElementById('company-edit').addEventListener('click', () => {
  document.getElementById('company-view').hidden = true;
  document.getElementById('company-edit-area').hidden = false;
  document.getElementById('company-edit').hidden = true;
  document.getElementById('company-save').hidden = false;
  document.getElementById('company-cancel').hidden = false;
});

document.getElementById('company-cancel').addEventListener('click', () => {
  document.getElementById('company-view').hidden = false;
  document.getElementById('company-edit-area').hidden = true;
  document.getElementById('company-edit').hidden = false;
  document.getElementById('company-save').hidden = true;
  document.getElementById('company-cancel').hidden = true;
});

document.getElementById('company-save').addEventListener('click', async () => {
  const name = window._activeCompany;
  if (!name) return;
  try {
    setBusy(true, 'saving…');
    await api('/api/companies/' + encodeURIComponent(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: document.getElementById('company-edit-area').value })
    });
    await loadCompany(name);
    document.getElementById('company-cancel').click();
  } catch(e) { setStatus('Save error: ' + e.message, 'error'); }
  finally { setBusy(false); }
});

document.getElementById('company-delete').addEventListener('click', async () => {
  const name = window._activeCompany;
  if (!name) return;
  const confirmed = window.confirm(
    'Permanently delete ' + name + '?\n\n' +
    'Removes the company file, output folder, and pipeline row.\n' +
    'For real rejections, use "Mark closed" instead — it keeps all context.'
  );
  if (!confirmed) return;
  try {
    setBusy(true, 'deleting…');
    const res = await fetch('/api/companies/' + encodeURIComponent(name), { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||'Delete failed'); }
    window._activeCompany = null;
    document.getElementById('company-detail').hidden = true;
    await loadCompanies();
    await loadPipeline();
  } catch(e) { setStatus('Delete error: ' + e.message, 'error'); }
  finally { setBusy(false); }
});

document.getElementById('company-close').addEventListener('click', async () => {
  const name = window._activeCompany;
  if (!name) return;
  const outcome = window.prompt(
    'Mark ' + name + ' as closed.\nOutcome (e.g. Rejected, Withdrew, Offer declined):',
    'Rejected'
  );
  if (!outcome) return;
  try {
    setBusy(true, 'closing…');
    await api('/api/companies/' + encodeURIComponent(name) + '/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome })
    });
    await loadCompany(name);
    await loadPipeline();
  } catch(e) { setStatus('Close error: ' + e.message, 'error'); }
  finally { setBusy(false); }
});

document.getElementById('company-prep-btn').addEventListener('click', () => {
  const name = window._activeCompany;
  if (!name) return;
  switchToTab('prep');
  const prepSelect = document.getElementById('prep-company');
  if (prepSelect) {
    const opt = Array.from(prepSelect.options).find(o => o.value === name);
    if (opt) prepSelect.value = name;
  }
  // Prefill the round from the company's current pipeline stage so a prep driven by a
  // recent update (e.g. an interview invite) is one click + Run, not a blank box.
  const roundEl = document.getElementById('prep-round');
  if (roundEl && !roundEl.value.trim()) {
    const stage = companyStage(name);
    if (stage) roundEl.value = stage;
  }
  roundEl.focus();
});

document.getElementById('companies-refresh').addEventListener('click', loadCompanies);

const companySearchEl = document.getElementById('company-search');
if (companySearchEl) companySearchEl.addEventListener('input', () => {
  _companySearch = companySearchEl.value;
  renderCompanyList();
});

// Parse edited markdown back into the structured sections object used by buildDocx
function parseMdToSections(md) {
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
  const sname = l => l.replace(/^##\s+/, '').trim().toLowerCase();

  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '---') { i++; continue; }
    if (!l.startsWith('## ')) { i++; continue; }
    const s = sname(l);

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

// Resume full-markdown editor
document.getElementById('resume-edit-btn').addEventListener('click', () => {
  if (!_resumeMarkdown) return;
  document.getElementById('resume-preview').hidden = true;
  document.getElementById('resume-md-editor').value = _resumeMarkdown;
  document.getElementById('resume-md-editor').hidden = false;
  document.getElementById('resume-edit-btn').hidden = true;
  document.getElementById('resume-apply-btn').hidden = false;
  document.getElementById('resume-cancel-edit-btn').hidden = false;
});

document.getElementById('resume-apply-btn').addEventListener('click', () => {
  _resumeMarkdown = document.getElementById('resume-md-editor').value;
  const previewEl = document.getElementById('resume-preview');
  previewEl.innerHTML = marked.parse(_resumeMarkdown);
  initBulletEdit();
  previewEl.hidden = false;
  document.getElementById('resume-md-editor').hidden = true;
  document.getElementById('resume-edit-btn').hidden = false;
  document.getElementById('resume-apply-btn').hidden = true;
  document.getElementById('resume-cancel-edit-btn').hidden = true;
  if (_resumeData) {
    _resumeData.sections = parseMdToSections(_resumeMarkdown);
    api('/api/rebuild-resume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_data: _resumeData, resume_markdown: _resumeMarkdown }),
    }).then(r => {
      if (r.docx_file) {
        const parts = r.docx_file.split('/');
        const a = document.getElementById('tailor-dl-docx');
        if (a) a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]);
      }
      if (r.html_file) {
        const parts = r.html_file.split('/');
        const a = document.getElementById('tailor-dl-html');
        if (a) a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]);
      }
    }).catch(() => {});
  }
});

document.getElementById('resume-cancel-edit-btn').addEventListener('click', () => {
  document.getElementById('resume-preview').hidden = false;
  document.getElementById('resume-md-editor').hidden = true;
  document.getElementById('resume-edit-btn').hidden = false;
  document.getElementById('resume-apply-btn').hidden = true;
  document.getElementById('resume-cancel-edit-btn').hidden = true;
});

// Command runners
async function runCommand({ url, body, outId, outRawId, wrapId, busyLabel, onResult, progress }) {
  if (busy) return;
  // Optional in-panel progress bar so a long Claude call doesn't look dead (user might
  // navigate away thinking it's stuck). Cycles through stage labels on a timer.
  let progTimer = null;
  const progBar = progress && document.getElementById(progress.barId);
  const progTxt = progress && document.getElementById(progress.textId);
  if (progBar) {
    const stages = progress.stages || ['Working…'];
    let si = 0;
    progBar.hidden = false;
    if (progTxt) progTxt.textContent = stages[0];
    progTimer = setInterval(() => {
      si = Math.min(si + 1, stages.length - 1);
      if (progTxt) progTxt.textContent = stages[si];
    }, progress.intervalMs || 20000);
  }
  try {
    setBusy(true, busyLabel || 'running…');
    const data = await api(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $(wrapId).hidden = false;
    render(outId, data.output || '');
    if (outRawId) $(outRawId).value = data.output || '';
    if (onResult) onResult(data);
    await loadPipeline();
    await loadCompanies();
  } catch (e) { setStatus('Error: ' + e.message, 'error'); }
  finally {
    setBusy(false); stopProgress();
    if (progTimer) clearInterval(progTimer);
    if (progBar) progBar.hidden = true;
  }
}

function parseATSScore(text) {
  const m1 = text.match(/Final ATS score[:\s~]+(\d+)%/i);
  if (m1) return parseInt(m1[1]);
  const m2 = text.match(/ATS check[:\s]+(\d+)\/(\d+)/i);
  if (m2) return Math.round((parseInt(m2[1]) / parseInt(m2[2])) * 100);
  return null;
}

function showATSBadge(score, ats) {
  const el = $('#ats-badge');
  const miss = $('#ats-missing');
  if (score === null || score === undefined) {
    el.hidden = true;
    if (miss) miss.hidden = true;
    return;
  }
  el.textContent = 'ATS ' + score + '%';
  el.className = 'ats-badge ' + (score >= 85 ? 'green' : score >= 70 ? 'amber' : 'red');
  el.hidden = false;
  // Show which JD keywords are missing — the actionable half of a deterministic score.
  if (miss) {
    const missing = (ats && ats.missing) || [];
    if (missing.length) {
      el.title = 'Matched ' + (ats.matched ? ats.matched.length : 0) + '/' + ats.keyword_count + ' JD keywords';
      miss.textContent = 'Missing keywords: ' + missing.slice(0, 12).join(', ') + (missing.length > 12 ? '…' : '');
      miss.hidden = false;
    } else {
      miss.hidden = true;
    }
  }
}

function initBulletEdit() {
  const container = document.getElementById('resume-preview');
  if (!container) return;
  container.querySelectorAll('li').forEach((li) => {
    if (li._editBound) return;
    li._editBound = true;
    li.title = 'Click to edit';
    li.addEventListener('click', function () {
      if (li.classList.contains('editing')) return;
      if (li.dataset.flagged) return;
      li.classList.add('editing');
      const originalHTML = li.innerHTML;
      const originalText = li.textContent.trim();
      li.innerHTML = '';

      const ta = document.createElement('textarea');
      ta.value = originalText; ta.rows = 3;
      ta.style.cssText = 'width:100%;font:inherit;font-size:13px;background:var(--surface-2);color:var(--text);border:1px solid var(--accent-2);border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;margin-bottom:4px;';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
      row.addEventListener('click', e => e.stopPropagation());

      const mkBtn = (label, color, bg) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `font:inherit;font-size:12px;padding:4px 10px;background:${bg||'transparent'};color:${color};border:1px solid ${color};border-radius:4px;cursor:pointer;`;
        return b;
      };

      const confirm = mkBtn('✓ Confirm', '#0b1014', 'var(--accent)');
      confirm.style.fontWeight = '600';
      const cancel  = mkBtn('Cancel', 'var(--text-2)', 'transparent');
      const flag    = mkBtn('⚠ Flag as invented', 'var(--amber)', 'transparent');

      row.append(confirm, cancel, flag);
      li.append(ta, row);
      ta.focus(); ta.select();

      confirm.addEventListener('click', () => {
        const newText = ta.value.trim();
        li.innerHTML = newText;
        li.classList.remove('editing');
        li.classList.add('user-edited');
        const raw = document.getElementById('tailor-out-raw');
        if (raw) raw.value = raw.value.replace(originalText, newText);
        if (_resumeMarkdown) _resumeMarkdown = _resumeMarkdown.replace('- ' + originalText, '- ' + newText);
        if (_resumeData) {
          (_resumeData.sections.experience || []).forEach(exp => {
            exp.bullets = exp.bullets.map(b => b === originalText ? newText : b);
          });
          (_resumeData.sections.skills_stack || []).forEach(group => {
            group.bullets = group.bullets.map(b => b === originalText ? newText : b);
          });
          api('/api/rebuild-resume', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_data: _resumeData, resume_markdown: _resumeMarkdown }),
          }).then(r => {
            if (r.docx_file) {
              const parts = r.docx_file.split('/');
              const a = document.getElementById('tailor-dl-docx');
              if (a) a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]);
            }
            if (r.html_file) {
              const parts = r.html_file.split('/');
              const a = document.getElementById('tailor-dl-html');
              if (a) a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]);
            }
          }).catch(() => {});
        }
        li._editBound = false;
        initBulletEdit();
      });

      cancel.addEventListener('click', () => {
        li.innerHTML = originalHTML;
        li.classList.remove('editing');
      });

      flag.addEventListener('click', async () => {
        try {
          await api('/api/flag-fabricated', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ bullet: originalText })
          });
          li.innerHTML = `<span style="opacity:.4;text-decoration:line-through">${originalText}</span> <span style="color:var(--amber);font-size:11px;font-weight:600;">⚠ flagged — blocked from future tailoring</span>`;
          li.classList.remove('editing');
          li.dataset.flagged = 'true';
          li.style.cursor = 'default';
        } catch(e) { setStatus('Flag error: ' + e.message, 'error'); }
      });
    });
  });
}

function applyDiff(show) {
  _diffVisible = show;
  const container = document.getElementById('resume-preview');
  if (!container || !_diffData) return;
  container.querySelectorAll('li').forEach(li => {
    li.classList.remove('diff-added', 'diff-modified');
    if (!show) return;
    const text = li.textContent.trim().toLowerCase();
    const matches = (arr) => (arr || []).some(b => {
      const needle = b.replace(/^[-*•]\s+/, '').substring(0, 35).toLowerCase();
      return needle.length > 5 && text.includes(needle);
    });
    if (matches(_diffData.added_bullets))    li.classList.add('diff-added');
    else if (matches(_diffData.modified_bullets)) li.classList.add('diff-modified');
  });
  const btn = document.getElementById('diff-toggle');
  if (btn) btn.textContent = show ? 'Hide changes' : 'Show changes';
}

function stopProgress() {
  clearInterval(_progressTimer);
  _progressTimer = null;
  const bar = document.getElementById('tailor-progress');
  if (bar) bar.hidden = true;
  const txt = document.getElementById('tailor-progress-text');
  if (txt) txt.textContent = 'Analysing JD…';
}

// CHECK MATCH
document.getElementById('match-run').addEventListener('click', async () => {
  const jd = document.getElementById('match-jd').value.trim();
  if (!jd) return setStatus('Paste a JD first', 'error');

  document.getElementById('match-out-wrap').hidden = true;
  const bar = document.getElementById('match-progress');
  const txt = document.getElementById('match-progress-text');
  const stages = ['Parsing the JD…', 'Checking fit against your profile…', 'Scoring keywords & gaps…'];
  let si = 0;
  if (bar) bar.hidden = false;
  if (txt) txt.textContent = stages[0];
  const timer = setInterval(() => { si = Math.min(si + 1, stages.length - 1); if (txt) txt.textContent = stages[si]; }, 15000);
  setBusy(true, 'checking match…');

  try {
    const r = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Match check failed');

    render('#match-out', d.output || '');

    const vb = document.getElementById('match-verdict');
    if (d.verdict) {
      vb.textContent = d.verdict;
      vb.className = 'verdict-badge ' + d.verdict.toLowerCase();
      vb.hidden = false;
    } else vb.hidden = true;

    const sb = document.getElementById('match-score');
    if (d.score !== null && d.score !== undefined) {
      // Same deterministic engine + thresholds as the Tailor tab's ATS badge, but
      // measured against the base resumes — so this reads as "coverage before tailoring".
      sb.textContent = 'ATS ' + d.score + '% base';
      sb.className = 'ats-badge ' + (d.score >= 85 ? 'green' : d.score >= 70 ? 'amber' : 'red');
      if (d.ats && d.ats.missing) {
        sb.title = 'Base-resume coverage — matched ' + (d.ats.matched ? d.ats.matched.length : 0) +
          '/' + d.ats.keyword_count + ' JD keywords before tailoring.' +
          (d.ats.missing.length ? ' Tailoring should add: ' + d.ats.missing.slice(0, 12).join(', ') : '');
      }
      sb.hidden = false;
    } else sb.hidden = true;

    // offer the tailor handoff unless it's a clear SKIP
    document.getElementById('match-to-tailor').hidden = (d.verdict === 'SKIP');

    document.getElementById('match-out-wrap').hidden = false;
  } catch (e) {
    setStatus(e.message, 'error');
    render('#match-out', '**Error:** ' + e.message);
    document.getElementById('match-verdict').hidden = true;
    document.getElementById('match-score').hidden = true;
    document.getElementById('match-to-tailor').hidden = true;
    document.getElementById('match-out-wrap').hidden = false;
  } finally {
    clearInterval(timer);
    if (bar) bar.hidden = true;
    setBusy(false);
  }
});

// hand the checked JD off to the Tailor tab
document.getElementById('match-to-tailor').addEventListener('click', () => {
  const jd = document.getElementById('match-jd').value.trim();
  switchToTab('tailor');
  const t = document.getElementById('tailor-jd');
  if (t) { t.value = jd; t.focus(); }
});

document.getElementById('tailor-run').addEventListener('click', async () => {
  const jd = document.getElementById('tailor-jd').value.trim();
  if (!jd) return setStatus('Paste a JD first', 'error');

  const ids = ['tailor-out-wrap','tailor-actions','ats-badge','ats-missing','diff-toggle','diff-callout','tailor-pdf-hint'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  const rp = document.getElementById('resume-preview');
  if (rp) rp.innerHTML = '';
  _resumeData = null; _diffData = null; _diffVisible = false; _resumeMarkdown = null;
  document.getElementById('resume-edit-btn').hidden = true;
  document.getElementById('resume-apply-btn').hidden = true;
  document.getElementById('resume-cancel-edit-btn').hidden = true;
  document.getElementById('resume-md-editor').hidden = true;

  let flags = '';
  if (document.getElementById('tailor-cover-letter').checked) flags += ' --cover-letter';
  if (document.getElementById('tailor-research').checked)     flags += ' --research';

  const facts = document.getElementById('tailor-facts').value.trim();
  const factsBlock = facts ? '\n\n--known-facts\n<<<KNOWN_FACTS\n' + facts + '\nKNOWN_FACTS' : '';

  const bar = document.getElementById('tailor-progress');
  const txt = document.getElementById('tailor-progress-text');
  const stages = ['Tailoring resume…','Applying keywords…','Running quality checks…','Building files…'];
  let si = 0;
  if (bar) bar.hidden = false;
  if (txt) txt.textContent = stages[0];
  _progressTimer = setInterval(() => {
    si = Math.min(si + 1, stages.length - 1);
    if (txt) txt.textContent = stages[si];
  }, 25000);

  setBusy(true, 'tailoring…');

  try {
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '/tailor ' + jd + flags + factsBlock, jd }),
    });
    const d = await r.json();
    console.log('[tailor] response:', { output_len: (d.output||'').length, resume_preview_len: (d.resume_preview||'').length, docx_file: d.docx_file, resume_data: !!d.resume_data });

    if (!r.ok) throw new Error(d.error || 'Tailor failed');

    const wrap = document.getElementById('tailor-out-wrap');
    if (wrap) wrap.hidden = false;

    if (d.resume_preview) {
      _resumeMarkdown = d.resume_preview;
      const previewEl = document.getElementById('resume-preview');
      if (previewEl) { previewEl.innerHTML = marked.parse(_resumeMarkdown); initBulletEdit(); }
      const editBtn = document.getElementById('resume-edit-btn');
      if (editBtn) editBtn.hidden = false;
    }

    render('#tailor-out', d.output || '');
    const rawEl = document.getElementById('tailor-out-raw');
    if (rawEl) rawEl.value = d.output || '';
    // Deterministic ATS score from the server; fall back to the legacy text-scrape only if absent.
    if (d.ats && typeof d.ats.score === 'number') showATSBadge(d.ats.score, d.ats);
    else showATSBadge(parseATSScore(d.output || ''));
    // auto-open analysis section when there's content
    if (d.output) {
      const det = document.querySelector('.analysis-details');
      if (det) det.open = true;
    }

    _resumeData = d.resume_data || null;
    _diffData   = d.diff_data   || null;

    if (d.diff_summary) {
      const callout = document.getElementById('diff-callout');
      if (callout) {
        const { added, modified, removed } = d.diff_summary;
        callout.innerHTML = `<span>vs base resume:</span>
          <span class="diff-added">+${added} added</span>
          <span class="diff-mod">~${modified} modified</span>
          <span class="diff-removed">-${removed} removed</span>`;
        callout.hidden = false;
      }
    }
    if (_diffData) {
      const dt = document.getElementById('diff-toggle');
      if (dt) { dt.hidden = false; dt.onclick = () => applyDiff(!_diffVisible); }
    }

    const actions = document.getElementById('tailor-actions');
    if (actions) actions.hidden = false;

    if (d.docx_file) {
      const parts = d.docx_file.split('/');
      const a = document.getElementById('tailor-dl-docx');
      if (a) { a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]); a.download = parts[1]; a.hidden = false; }
    }
    if (d.html_file) {
      const parts = d.html_file.split('/');
      const a = document.getElementById('tailor-dl-html');
      if (a) { a.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]); a.download = parts[1]; a.hidden = false; }
      const hint = document.getElementById('tailor-pdf-hint');
      if (hint) hint.hidden = false;
    }
    if (d.saved_cover) {
      const fname = d.saved_cover.replace('output/', '');
      const a = document.getElementById('tailor-dl-cover');
      if (a) { a.href = '/api/outputs/' + encodeURIComponent(fname); a.download = fname; a.hidden = false; }
    }

    if (_resumeData) {
      const ms = document.getElementById('tailor-mark-sent');
      if (ms) {
        ms.hidden = false; ms.disabled = false; ms.textContent = 'Mark as sent';
        ms.onclick = async () => {
          try {
            setBusy(true, 'logging…');
            await api('/api/mark-sent', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                company: _resumeData.slug, filename: _resumeData.filename + '.docx',
                ats_score: _resumeData.ats_score, jd_title: _resumeData.jd_title,
                date: _resumeData.date,
                jd_snippet: (document.getElementById('tailor-jd').value || '').replace(/\s+/g,' ').substring(0,800),
              }),
            });
            ms.textContent = '✓ Logged as sent'; ms.disabled = true;
            await loadPipeline(); await loadCompanies();
          } catch (e) { setStatus('Error: ' + e.message, 'error'); }
          finally { setBusy(false); }
        };
      }
    }
    await loadPipeline();
    await loadCompanies();
  } catch (e) {
    setStatus('Error: ' + e.message, 'error');
  } finally {
    setBusy(false);
    stopProgress();
  }
});

$('#prep-run').addEventListener('click', () => {
  const company = $('#prep-company').value;
  const round = $('#prep-round').value.trim();
  if (!company || !round) {
    setStatus('Pick a company and a round', 'error');
    // The status dot alone is easy to miss — flag the round field visibly so the click
    // doesn't feel like a no-op.
    const r = $('#prep-round');
    if (r) { r.focus(); r.classList.add('field-error'); setTimeout(() => r.classList.remove('field-error'), 1500); }
    return;
  }
  const dl = document.getElementById('prep-dl');
  if (dl) dl.hidden = true;
  runCommand({ url: '/api/prep', body: { company, round },
    outId: '#prep-out', outRawId: '#prep-out-raw',
    wrapId: '#prep-out-wrap', busyLabel: 'prepping…',
    progress: {
      barId: 'prep-progress', textId: 'prep-progress-text', intervalMs: 20000,
      stages: ['Reading the company notes & JD…', 'Pulling interview lessons…',
        'Mapping your experience to the round…', 'Drafting the prep pack…',
        'Almost there — formatting…'],
    },
    onResult: (data) => {
      if (dl && data.prep_file) {
        const parts = data.prep_file.split('/');
        dl.href = '/api/outputs/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]);
        dl.download = parts[1];
        dl.hidden = false;
      }
    } });
});

$('#log-run-direct').addEventListener('click', async () => {
  const company = $('#log-company-new').value.trim() || $('#log-company-existing').value;
  const note = $('#log-note').value.trim();
  const stage = $('#log-stage').value.trim();
  if (!company || !note) return setStatus('Pick/name a company and write a note', 'error');
  try {
    setBusy(true, 'logging…');
    const r = await api('/api/log-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, note, stage: stage || undefined }),
    });
    $('#log-out-wrap').hidden = false;
    render('#log-out', '**Logged:** ' + r.entry);
    $('#log-note').value = '';
    $('#log-stage').value = '';
    await loadPipeline();
    await loadCompanies();
  } catch (e) { setStatus('Error: ' + e.message, 'error'); }
  finally { setBusy(false); }
});

$('#log-run-ai').addEventListener('click', () => {
  const company = $('#log-company-new').value.trim() || $('#log-company-existing').value;
  const note = $('#log-note').value.trim();
  if (!company || !note) return setStatus('Pick/name a company and write a note', 'error');
  runCommand({ url: '/api/log', body: { company, note },
    outId: '#log-out', wrapId: '#log-out-wrap', busyLabel: 'logging…' });
});

$('#intake-run').addEventListener('click', () => {
  const notes = $('#intake-notes').value.trim();
  if (!notes) return setStatus('Paste something first', 'error');
  runCommand({ url: '/api/intake', body: { notes },
    outId: '#intake-out', wrapId: '#intake-out-wrap', busyLabel: 'ingesting…',
    onResult: (data) => {
      // Outcome/feedback in the paste → the server fired the learning loop for those companies. It
      // stages proposals asynchronously; tell the user where to review them (they're not on that tab).
      const learning = (data && data.learning) || [];
      if (learning.length) {
        setStatus('Learning from feedback for ' + learning.join(', ') +
          ' — review staged lessons in the Companies tab shortly.', 'ok');
      }
    } });
});

// ── SETUP / ONBOARDING ───────────────────────────────────────────────────────
async function refreshSetupState() {
  try {
    const s = await api('/api/setup-status');
    const welcome = $('#setup-welcome');
    if (welcome) welcome.hidden = s.onboarded;
    return s;
  } catch (_) { return { onboarded: true, hasResume: true }; }
}

const _setupFile = $('#setup-file');
if (_setupFile) _setupFile.addEventListener('change', function () {
  const lbl = $('#setup-file-label');
  if (lbl) lbl.textContent = this.files[0] ? this.files[0].name : 'Choose your résumé…';
});

$('#setup-run').addEventListener('click', async () => {
  if (busy) return;
  const file = $('#setup-file').files[0];
  const notes = $('#setup-notes').value.trim();
  if (!file && !notes) return setStatus('Upload your résumé (PDF or DOCX) first', 'error');
  const progress = $('#setup-progress');
  try {
    setBusy(true, 'building profile…');
    if (progress) progress.hidden = false;
    const body = {
      notes,
      comp: $('#setup-comp').value.trim(),
      work_auth: $('#setup-workauth').value.trim(),
      spelling: $('#setup-spelling').value,
    };
    if (file) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      body.file_base64 = btoa(binary);
      body.file_ext = file.name.split('.').pop().toLowerCase();
      body.filename = file.name;
    }
    const data = await api('/api/onboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    $('#setup-out-wrap').hidden = false;
    render('#setup-out', data.output || 'Profile generated.');
    await refreshSetupState();
    const hint = $('#setup-resume-hint');
    if (hint && data.saved_resume) {
      hint.innerHTML = '✓ Saved <code>' + data.saved_resume + '</code> as your base résumé. Review your profile above, then head to the Tailor tab.';
    }
    setStatus(data.onboarded ? 'Profile created — review it, then tailor' : 'ready');
    await loadPipeline(); await loadCompanies();
  } catch (e) {
    setStatus('Error: ' + e.message, 'error');
    $('#setup-out-wrap').hidden = false;
    render('#setup-out', '**Error:** ' + e.message);
  } finally {
    setBusy(false);
    if (progress) progress.hidden = true;
  }
});

// Copy + clear
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy]');
  if (c) {
    const txt = $('#' + c.dataset.copy).value;
    navigator.clipboard.writeText(txt).then(() => setStatus('copied'));
  }
  const cl = e.target.closest('[data-clear]');
  if (cl) {
    const k = cl.dataset.clear;
    if (k === 'tailor') {
      document.getElementById('tailor-jd').value = '';
      document.getElementById('tailor-facts').value = '';
      document.getElementById('tailor-out-wrap').hidden = true;
      document.getElementById('tailor-actions').hidden = true;
      document.getElementById('tailor-progress').hidden = true;
      document.getElementById('ats-badge').hidden = true;
      const am = document.getElementById('ats-missing'); if (am) am.hidden = true;
      const dt = document.getElementById('diff-toggle');
      if (dt) dt.hidden = true;
      const dc = document.getElementById('diff-callout');
      if (dc) dc.hidden = true;
      document.getElementById('tailor-pdf-hint').hidden = true;
      const rp = document.getElementById('resume-preview');
      if (rp) rp.innerHTML = '';
      document.getElementById('resume-md-editor').hidden = true;
      document.getElementById('resume-edit-btn').hidden = true;
      document.getElementById('resume-apply-btn').hidden = true;
      document.getElementById('resume-cancel-edit-btn').hidden = true;
      _resumeData = null; _diffData = null; _diffVisible = false; _resumeMarkdown = null;
      stopProgress();
    }
    if (k === 'prep') { $('#prep-round').value = ''; $('#prep-out-wrap').hidden = true; const pdl = document.getElementById('prep-dl'); if (pdl) pdl.hidden = true; }
    if (k === 'log') { $('#log-note').value = ''; $('#log-company-new').value = ''; $('#log-out-wrap').hidden = true; }
    if (k === 'intake') { $('#intake-notes').value = ''; $('#intake-out-wrap').hidden = true; }
    if (k === 'setup') {
      $('#setup-file').value = ''; $('#setup-notes').value = '';
      $('#setup-comp').value = ''; $('#setup-workauth').value = ''; $('#setup-spelling').value = '';
      const lbl = $('#setup-file-label'); if (lbl) lbl.textContent = 'Choose your résumé…';
      $('#setup-out-wrap').hidden = true;
    }
  }
});

// ── UPLOAD SENT RESUME ───────────────────────────────────────────────────────

document.getElementById('upload-resume-toggle').addEventListener('click', () => {
  document.getElementById('upload-form').hidden = false;
  document.getElementById('upload-resume-toggle').hidden = true;
});

document.getElementById('upload-cancel-btn').addEventListener('click', resetUploadForm);

function resetUploadForm() {
  document.getElementById('upload-form').hidden = true;
  document.getElementById('upload-resume-toggle').hidden = false;
  document.getElementById('upload-file').value = '';
  document.getElementById('file-pick-label').textContent = 'Choose file…';
  document.getElementById('file-pick-label').classList.remove('has-file');
  document.getElementById('upload-ats').value = '';
  document.getElementById('upload-jd-title').value = '';
  document.getElementById('upload-new-content').value = '';
  document.getElementById('upload-status').hidden = true;
  document.getElementById('context-review').hidden = true;
  document.getElementById('context-bullets-list').innerHTML = '';
  document.getElementById('context-add-status').textContent = '';
}

document.getElementById('upload-file').addEventListener('change', function () {
  const f = this.files[0];
  const label = document.getElementById('file-pick-label');
  if (f) {
    label.textContent = f.name;
    label.classList.add('has-file');
  } else {
    label.textContent = 'Choose file…';
    label.classList.remove('has-file');
  }
});

document.getElementById('rerun-learning-btn').addEventListener('click', async () => {
  const company = window._activeCompany;
  if (!company) return setStatus('No company selected', 'error');
  // The status line + results panel live inside the (collapsed) upload form — reveal it
  // so re-run output is actually visible.
  document.getElementById('upload-form').hidden = false;
  const statusEl = document.getElementById('upload-status');
  statusEl.style.color = 'var(--text-2)';
  statusEl.textContent = 'Re-running learning (diffing submitted resume ↔ draft ↔ JD)…';
  statusEl.hidden = false;
  try {
    setBusy(true, 'learning…');
    const ctx = await api('/api/extract-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company }),
    });
    const nb = ctx.new_bullets || [], fl = ctx.framing_lessons || [], cr = ctx.corrections || [], cf = ctx.conflicts || [];
    if (!nb.length && !fl.length && !cr.length && !cf.length) {
      statusEl.textContent = '✓ Learning ran — nothing new to add (already captured).';
    } else {
      statusEl.textContent = '✓ Learning ran — review below.';
    }
    showContextReview(nb, fl, cr, cf);
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Learning failed: ' + e.message;
  } finally {
    setBusy(false);
  }
});

document.getElementById('upload-submit-btn').addEventListener('click', async () => {
  const file = document.getElementById('upload-file').files[0];
  const company = window._activeCompany;
  const ats = document.getElementById('upload-ats').value.trim();
  const jdTitle = document.getElementById('upload-jd-title').value.trim();

  if (!company) return setStatus('No company selected', 'error');
  if (!file) return setStatus('Choose a file first', 'error');
  if (!jdTitle) {
    const el = document.getElementById('upload-status');
    el.style.color = 'var(--red, #e05c5c)';
    el.textContent = 'JD title is required.';
    el.hidden = false;
    document.getElementById('upload-jd-title').focus();
    return;
  }

  const statusEl = document.getElementById('upload-status');
  statusEl.style.color = 'var(--text-2)';
  statusEl.textContent = 'Uploading & extracting context…';
  statusEl.hidden = false;

  try {
    setBusy(true, 'uploading…');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const b64 = btoa(binary);
    const ext = file.name.split('.').pop().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const r = await api('/api/upload-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company,
        filename: file.name,
        file_base64: b64,
        file_ext: ext,
        ats_score: ats || null,
        jd_title: jdTitle || null,
        date: today,
      }),
    });

    statusEl.style.color = 'var(--accent)';
    statusEl.textContent = '✓ Registered: ' + r.filename + ' · logged in pipeline';
    setBusy(false);
    await loadCompany(company);
    await loadPipeline();

    // context extraction runs after — non-blocking from the user's perspective
    if (r.extracted) {
      statusEl.textContent += ' · extracting context…';
      try {
        const ctx = await api('/api/extract-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company }),
        });
        statusEl.textContent = '✓ Registered: ' + r.filename + ' · logged in pipeline';
        showContextReview(ctx.new_bullets || [], ctx.framing_lessons || [], ctx.corrections || [], ctx.conflicts || []);
      } catch (e) {
        statusEl.textContent += ' (context extraction failed)';
      }
    }
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Error: ' + e.message;
  } finally {
    setBusy(false);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showContextReview(bullets, lessons, corrections, conflicts) {
  lessons = lessons || [];
  corrections = corrections || [];
  conflicts = conflicts || [];
  const conflBlock = document.getElementById('context-conflicts-block');
  const conflList = document.getElementById('context-conflicts-list');
  if (conflicts.length) {
    conflList.innerHTML = conflicts.map(c => `
      <div class="context-bullet-row" style="color:var(--red,#e05c5c)">
        <span>⚠ <strong>${escapeHtml(c.in_resume)}</strong> — ${escapeHtml(c.rule)}${c.why ? ` <em style="color:var(--muted)">(${escapeHtml(c.why)})</em>` : ''}</span>
      </div>
    `).join('');
    conflBlock.hidden = false;
  } else {
    conflBlock.hidden = true;
  }
  const list = document.getElementById('context-bullets-list');
  const section = document.getElementById('context-review');
  if (!bullets.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">No new achievements found — everything already in the bank.</p>';
  } else {
    list.innerHTML = bullets.map((b, i) => `
      <label class="context-bullet-row">
        <input type="checkbox" class="context-cb" data-idx="${i}" checked />
        <span>${escapeHtml(b)}</span>
      </label>
    `).join('');
  }
  list._bullets = bullets;

  const lessonsBlock = document.getElementById('context-lessons-block');
  const lessonsList = document.getElementById('context-lessons-list');
  if (lessons.length) {
    lessonsList.innerHTML = lessons.map((l, i) => `
      <label class="context-bullet-row">
        <input type="checkbox" class="context-lesson-cb" data-idx="${i}" checked />
        <span>${escapeHtml(l)}</span>
      </label>
    `).join('');
    lessonsList._lessons = lessons;
    lessonsBlock.hidden = false;
  } else {
    lessonsList._lessons = [];
    lessonsBlock.hidden = true;
  }

  const corrBlock = document.getElementById('context-corrections-block');
  const corrList = document.getElementById('context-corrections-list');
  if (corrections.length) {
    corrList.innerHTML = corrections.map((c, i) => `
      <label class="context-bullet-row">
        <input type="checkbox" class="context-correction-cb" data-idx="${i}" checked />
        <span><s style="color:var(--muted)">${escapeHtml(c.old)}</s> → <strong>${escapeHtml(c.new)}</strong>${c.why ? ` <em style="color:var(--muted);font-size:12px">(${escapeHtml(c.why)})</em>` : ''}</span>
      </label>
    `).join('');
    corrList._corrections = corrections;
    corrBlock.hidden = false;
  } else {
    corrList._corrections = [];
    corrBlock.hidden = true;
  }
  section.hidden = false;
}

document.getElementById('add-selected-context').addEventListener('click', async () => {
  const list = document.getElementById('context-bullets-list');
  const lessonsList = document.getElementById('context-lessons-list');
  const checkedBullets = Array.from(list.querySelectorAll('.context-cb:checked'))
    .map(cb => list._bullets[parseInt(cb.dataset.idx)]);
  const checkedLessons = Array.from(lessonsList.querySelectorAll('.context-lesson-cb:checked'))
    .map(cb => lessonsList._lessons[parseInt(cb.dataset.idx)]);
  const corrList = document.getElementById('context-corrections-list');
  const checkedCorrections = Array.from(corrList.querySelectorAll('.context-correction-cb:checked'))
    .map(cb => corrList._corrections[parseInt(cb.dataset.idx)]);
  if (!checkedBullets.length && !checkedLessons.length && !checkedCorrections.length) return;
  const statusEl = document.getElementById('context-add-status');
  try {
    setBusy(true, 'updating CLAUDE.md…');
    const calls = [];
    if (checkedBullets.length) {
      calls.push(api('/api/add-to-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bullets: checkedBullets }),
      }));
    }
    if (checkedLessons.length) {
      calls.push(api('/api/add-lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons: checkedLessons }),
      }));
    }
    let corrResult = null;
    if (checkedCorrections.length) {
      corrResult = await api('/api/apply-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections: checkedCorrections }),
      });
    }
    await Promise.all(calls);
    const parts = [];
    if (checkedBullets.length) parts.push(checkedBullets.length + ' bullet' + (checkedBullets.length > 1 ? 's' : ''));
    if (checkedLessons.length) parts.push(checkedLessons.length + ' lesson' + (checkedLessons.length > 1 ? 's' : ''));
    if (corrResult) parts.push(corrResult.applied + ' correction' + (corrResult.applied !== 1 ? 's' : ''));
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = '✓ ' + parts.join(' + ') + ' applied to CLAUDE.md';
    // Some corrections may not be safely auto-applicable (0 or >1 verbatim matches) — say so honestly.
    const manual = (corrResult && corrResult.skipped || []).filter(s => /apply by hand/.test(s.reason || ''));
    if (manual.length) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent += ` · ${manual.length} correction(s) need a manual CLAUDE.md edit (` +
        manual.map(s => `"${s.old}" ${s.reason}`).join('; ') + ')';
    }
    list.querySelectorAll('.context-cb:checked').forEach(cb => {
      cb.closest('label').style.opacity = '0.4';
      cb.disabled = true;
    });
    lessonsList.querySelectorAll('.context-lesson-cb:checked').forEach(cb => {
      cb.closest('label').style.opacity = '0.4';
      cb.disabled = true;
    });
    corrList.querySelectorAll('.context-correction-cb:checked').forEach(cb => {
      cb.closest('label').style.opacity = '0.4';
      cb.disabled = true;
    });
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    setBusy(false);
  }
});

// boot
stopProgress();
loadPipeline();
loadCompanies();
// First-run gate: if there's no profile yet, land the user on Setup.
refreshSetupState().then(s => { if (!s.onboarded) switchToTab('setup'); });
