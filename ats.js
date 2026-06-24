// Deterministic ATS score — a reproducible keyword-coverage measure.
// Pulls the salient skill/requirement terms out of a JD and measures how many
// appear in the resume. Replaces scraping an LLM-estimated score from prose:
// same JD + resume always yields the same number, and the missing-keyword list
// is actionable. This is a keyword-coverage heuristic, not a real ATS engine.

const ATS_STOPWORDS = new Set((
  'a an the and or but if then else of to in on at for with from by as is are was were be been being ' +
  'this that these those you your we our their they them it its will shall can could should would may might must ' +
  'do does did have has had not no yes role team work working experience years year strong excellent ability able ' +
  'including etc across into over under more most other others new using used use help support ensure ensures ' +
  'drive drives driving deliver delivers delivered build builds building lead leads leading manage manages managing ' +
  'create creates creating develop develops developing within about which who whom what when where why how all any ' +
  'each both few many much such own same so than too very just also per via plus join play critical part close ' +
  'fast paced environment global high looking offer what need based field related equivalent practical ' +
  'pto job about responsibilities requirements opportunities benefits perks schedules schedule'
).split(/\s+/));

function atsNormalize(s) {
  return ' ' + String(s || '').toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')   // keep + # . / - for c#, ci/cd, .net, 21 cfr
    .replace(/\s+/g, ' ').trim() + ' ';
}

function extractJdKeywords(jd) {
  // Strip saved-JD metadata (our "# JD —" / "_Captured …_" header) and URLs so they
  // don't pollute the keyword set.
  jd = String(jd || '')
    .replace(/^#.*$/gm, ' ')
    .replace(/^_.*_\s*$/gm, ' ')
    .replace(/https?:\/\/\S+/g, ' ');

  const weights = new Map();
  const add = (term, w) => {
    term = term.trim();
    if (!term || ATS_STOPWORDS.has(term)) return;
    weights.set(term, Math.max(weights.get(term) || 0, w));
  };

  // 1) "Hard" tokens (case-sensitive): acronyms & symboled tech terms — high signal.
  const hardPatterns = [
    /\b[A-Za-z]*[A-Z]{2,}[A-Za-z0-9]*\b/g, // FDA, SQL, API, TDD, BDD, iOS, SAFe, QA
    /\b[A-Za-z][A-Za-z0-9]*[#+]+/g,         // c#, c++
    /\b\.[A-Za-z]+\b/g,                     // .net
    /\b[A-Za-z]+\/[A-Za-z]+\b/g,            // ci/cd
  ];
  for (const re of hardPatterns) {
    let m;
    while ((m = re.exec(jd)) !== null) {
      const t = m[0].toLowerCase().replace(/^\.+|\.+$/g, '');
      if (t.length < 2 || /^\d+$/.test(t)) continue;
      // drop slash-joins where every part is filler ("and/or")
      if (t.includes('/') && t.split('/').every(p => p.length < 2 || ATS_STOPWORDS.has(p))) continue;
      add(t, 3);
    }
  }

  // 2) Skill unigrams (frequency-ranked) + RECURRING bigrams only. One-off prose
  //    bigrams ("leadership ensuring") are noise and never match a resume, so we
  //    require a bigram to appear ≥2× before trusting it as a real term.
  const toks = atsNormalize(jd).trim().split(' ')
    .filter(t => t && !ATS_STOPWORDS.has(t) && (t.length >= 3 || /[a-z]\d|\d[a-z]/.test(t)));
  const uni = new Map(), bi = new Map();
  const bump = (map, t) => map.set(t, (map.get(t) || 0) + 1);
  for (let i = 0; i < toks.length; i++) {
    bump(uni, toks[i]);
    if (i + 1 < toks.length && !ATS_STOPWORDS.has(toks[i + 1])) bump(bi, toks[i] + ' ' + toks[i + 1]);
  }
  for (const [term, f] of uni) add(term, 1 + Math.min(f - 1, 3) * 0.6);
  for (const [term, f] of bi) if (f >= 2) add(term, 2.5 + Math.min(f - 1, 2) * 0.5);

  // Focus on the most salient terms.
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([term, weight]) => ({ term, weight }));
}

function atsTermPresent(term, resumeNorm) {
  const variants = [term];
  if (!term.includes(' ')) variants.push(term.endsWith('s') ? term.slice(0, -1) : term + 's');
  return variants.some(v => resumeNorm.includes(' ' + v + ' '));
}

function computeAtsScore(jdText, resumeText) {
  if (!jdText || !resumeText) return null;
  const kws = extractJdKeywords(jdText);
  if (!kws.length) return null;
  const resumeNorm = atsNormalize(resumeText);
  const matched = [], missing = [];
  let got = 0, total = 0;
  for (const { term, weight } of kws) {
    total += weight;
    if (atsTermPresent(term, resumeNorm)) { got += weight; matched.push(term); }
    else missing.push(term);
  }
  return { score: Math.round((100 * got) / total), matched, missing, keyword_count: kws.length };
}

module.exports = { computeAtsScore, extractJdKeywords };
