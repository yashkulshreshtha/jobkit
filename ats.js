// Deterministic ATS score — a reproducible skill-coverage measure.
//
// Real ATS / recruiter-screening tools don't count arbitrary words; they match a
// job description against a known vocabulary of skills, tools, methodologies and
// role competencies, then check how many of those the resume actually contains.
// We do the same: a curated gazetteer (below) is the ONLY thing that can become a
// keyword, so the score is consistent, defensible, and free of prose noise
// ("mission", "daily", "vision") and regex fragments ("hv", "vcs", "ci", "gtm").
//
// Same JD + resume always yields the same number, and the missing-keyword list is
// made of real, human-readable skills you can act on. This is a keyword-coverage
// heuristic, not a real ATS engine — but it now mirrors how one behaves.
//
// Extending it: add an entry to SKILLS. Each entry is [Display, [aliases…]] where
// aliases are lowercase surface forms (acronyms, synonyms, spellings) that all map
// to the one display term. Matching is whole-token (boundary-aware) and handles
// simple plurals automatically, so add the base form, not every inflection.

function atsNormalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')   // keep + # . / - for c#, ci/cd, .net, node.js
    .replace(/\s+/g, ' ').trim();
}

// --- Curated skills / competencies gazetteer ------------------------------------
// [display, aliases]. First alias defaults to the display lowercased if omitted.
const SKILLS = [
  // Languages
  ['Java', ['java']],
  ['Kotlin', ['kotlin']],
  ['Swift', ['swift']],
  ['Python', ['python']],
  ['TypeScript', ['typescript']],
  ['JavaScript', ['javascript']],
  ['Go', ['golang', 'go']],
  ['C#', ['c#']],
  ['.NET', ['.net', 'dotnet', 'asp.net']],
  ['C++', ['c++']],
  ['PHP', ['php']],
  ['Ruby', ['ruby', 'rails', 'ruby on rails']],
  ['Scala', ['scala']],
  ['Rust', ['rust']],
  ['SQL', ['sql']],
  ['Objective-C', ['objective-c', 'objective c']],

  // Frontend / mobile
  ['React', ['react', 'react.js', 'reactjs']],
  ['Angular', ['angular']],
  ['Vue', ['vue', 'vue.js', 'vuejs']],
  ['Node.js', ['node.js', 'nodejs', 'node']],
  ['iOS', ['ios']],
  ['Android', ['android']],
  ['Espresso', ['espresso']],
  ['XCUITest', ['xcuitest']],
  ['Appium', ['appium']],
  ['Jetpack Compose', ['jetpack compose']],
  ['SwiftUI', ['swiftui']],
  ['Mobile Engineering', ['mobile engineering', 'mobile development', 'mobile app']],

  // Backend / APIs / architecture
  ['Spring Boot', ['spring boot', 'spring']],
  ['GraphQL', ['graphql']],
  ['REST APIs', ['rest api', 'rest apis', 'restful']],
  ['gRPC', ['grpc']],
  ['Microservices', ['microservice', 'microservices']],
  ['Event-Driven Architecture', ['event-driven', 'event driven', 'event-driven architecture']],
  ['Distributed Systems', ['distributed systems']],
  ['System Design', ['system design']],
  ['Software Architecture', ['software architecture', 'architecture']],
  ['Domain-Driven Design', ['domain-driven design', 'ddd']],
  ['API Design', ['api design']],
  ['Scalability', ['scalability', 'scalable']],
  ['Reliability', ['reliability', 'reliable']],
  ['High Availability', ['high availability', 'high-availability']],
  ['ADRs', ['adr', 'adrs', 'architecture decision record']],
  ['C4 Model', ['c4 model', 'c4']],

  // Cloud / infra / messaging
  ['AWS', ['aws', 'amazon web services']],
  ['GCP', ['gcp', 'google cloud']],
  ['Azure', ['azure']],
  ['Kubernetes', ['kubernetes', 'k8s']],
  ['Docker', ['docker']],
  ['Terraform', ['terraform']],
  ['Serverless', ['serverless', 'cloud functions', 'cloud run', 'lambda']],
  ['Pub/Sub', ['pub/sub', 'pubsub']],
  ['SQS', ['sqs']],
  ['Kafka', ['kafka']],
  ['RabbitMQ', ['rabbitmq']],
  ['Infrastructure as Code', ['infrastructure as code', 'iac']],

  // Data / BI / ML
  ['BigQuery', ['bigquery']],
  ['Looker', ['looker', 'looker studio']],
  ['Tableau', ['tableau']],
  ['ETL', ['etl']],
  ['Data Pipelines', ['data pipeline', 'data pipelines']],
  ['Data Warehouse', ['data warehouse', 'data warehousing']],
  ['Analytics', ['analytics']],
  ['Machine Learning', ['machine learning', 'ml']],
  ['AI', ['artificial intelligence', 'ai']],
  ['LLM', ['llm', 'large language model', 'generative ai', 'genai']],
  ['Data Science', ['data science']],
  ['MLOps', ['mlops']],

  // Observability / quality tooling
  ['Datadog', ['datadog']],
  ['Sentry', ['sentry']],
  ['Grafana', ['grafana']],
  ['Prometheus', ['prometheus']],
  ['Firebase', ['firebase']],
  ['Observability', ['observability']],
  ['Monitoring', ['monitoring']],

  // QA / testing
  ['Test Automation', ['test automation', 'automated testing', 'automation testing']],
  ['Selenium', ['selenium']],
  ['Cypress', ['cypress']],
  ['Playwright', ['playwright']],
  ['JUnit', ['junit']],
  ['TestNG', ['testng']],
  ['Pytest', ['pytest']],
  ['RestAssured', ['restassured', 'rest assured']],
  ['Cucumber', ['cucumber']],
  ['Gherkin', ['gherkin']],
  ['Pactflow', ['pactflow', 'pact']],
  ['Contract Testing', ['contract testing']],
  ['Unit Testing', ['unit testing', 'unit test', 'unit tests']],
  ['Integration Testing', ['integration testing', 'integration test']],
  ['End-to-End Testing', ['end-to-end testing', 'e2e testing', 'e2e']],
  ['Regression Testing', ['regression testing', 'regression']],
  ['Exploratory Testing', ['exploratory testing']],
  ['Performance Testing', ['performance testing', 'load testing']],
  ['TDD', ['tdd', 'test-driven development', 'test driven development']],
  ['BDD', ['bdd', 'behaviour-driven development', 'behavior-driven development']],
  ['Test Strategy', ['test strategy', 'testing strategy']],
  ['Quality Assurance', ['quality assurance', 'qa']],
  ['Quality Engineering', ['quality engineering']],
  ['Code Quality', ['code quality']],
  ['Code Coverage', ['code coverage', 'test coverage']],
  ['Shift-Left', ['shift-left', 'shift left']],
  ['SDET', ['sdet']],
  ['BrowserStack', ['browserstack']],
  ['Allure', ['allure']],

  // DevOps / CI/CD / SCM
  ['CI/CD', ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment']],
  ['Jenkins', ['jenkins']],
  ['GitHub Actions', ['github actions']],
  ['GitLab CI', ['gitlab ci']],
  ['Drone', ['drone']],
  ['Git', ['git']],
  ['GitHub', ['github']],
  ['GitLab', ['gitlab']],
  ['Version Control', ['version control']],
  ['DevOps', ['devops']],
  ['SRE', ['sre', 'site reliability']],
  ['Codacy', ['codacy']],

  // Ways of working / delivery
  ['Agile', ['agile']],
  ['Scrum', ['scrum']],
  ['Kanban', ['kanban']],
  ['SAFe', ['scaled agile', 'safe framework']],
  ['Lean', ['lean']],
  ['Sprint Planning', ['sprint planning', 'sprints']],
  ['OKRs', ['okr', 'okrs']],
  ['KPIs', ['kpi', 'kpis']],
  ['Roadmap', ['roadmap', 'roadmapping']],
  ['Prioritization', ['prioritisation', 'prioritization']],
  ['Definition of Done', ['definition of done']],
  ['Continuous Improvement', ['continuous improvement']],
  ['Developer Experience', ['developer experience', 'devex', 'developer productivity']],
  ['Tooling & Workflows', ['tooling', 'developer tools', 'development tools', 'developer workflows']],

  // Engineering leadership / management
  ['Engineering Manager', ['engineering manager', 'engineering management']],
  ['People Management', ['people management', 'line management', 'managing engineers']],
  ['Team Leadership', ['team leadership', 'technical leadership', 'leading teams']],
  ['Mentoring', ['mentoring', 'mentor', 'mentorship']],
  ['Coaching', ['coaching', 'coach']],
  ['Hiring', ['hiring', 'recruiting', 'recruitment', 'attracting talent']],
  ['Performance Management', ['performance management', 'performance review']],
  ['Career Development', ['career development', 'career growth', 'career progression']],
  ['Cross-Functional Collaboration', ['cross-functional', 'cross functional']],
  ['Stakeholder Management', ['stakeholder management', 'stakeholders']],
  ['Delivery Management', ['delivery management', 'software delivery', 'delivery']],
  ['Project Management', ['project management', 'project planning']],
  ['Program Management', ['program management', 'programme management']],
  ['Technical Strategy', ['technical strategy', 'technical vision', 'technical direction']],
  ['Product Strategy', ['product strategy', 'product goals']],
  ['Risk Management', ['risk management', 'risk mitigation']],
  ['Team Building', ['team building', 'building teams', 'high-performing team']],

  // Domain
  ['Healthcare', ['healthcare', 'health tech', 'healthtech']],
  ['Fintech', ['fintech']],
  ['Payments', ['payments', 'payment']],
  ['E-commerce', ['e-commerce', 'ecommerce']],
  ['SaaS', ['saas']],
  ['Marketplace', ['marketplace']],
  ['Logistics', ['logistics']],
  ['Compliance', ['compliance']],
  ['GDPR', ['gdpr']],
  ['KYC', ['kyc']],
  ['Integrations', ['integration', 'integrations']],

  // Languages (human)
  ['German', ['german']],
  ['English', ['english']],
];

// Pre-compile each skill into { display, res: [RegExp…] } with boundary-aware,
// plural-tolerant matching. Boundaries = not flanked by [a-z0-9], so ".net" still
// matches inside "c#/.net" and "go" won't match inside "google".
function boundaryRe(alias) {
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![a-z0-9])' + esc + '(?![a-z0-9])', 'g');
}
function aliasVariants(alias) {
  const v = new Set([alias]);
  if (/^[a-z0-9]+$/.test(alias)) {            // single plain word → toggle plural
    v.add(alias.endsWith('s') ? alias.slice(0, -1) : alias + 's');
  }
  return [...v];
}
const SKILLS_PRE = SKILLS.map(([display, aliases]) => ({
  display,
  res: [...new Set(aliases.flatMap(aliasVariants))].map(boundaryRe),
}));

function countHits(res, text) {
  let n = 0;
  for (const re of res) { re.lastIndex = 0; const m = text.match(re); if (m) n += m.length; }
  return n;
}
function present(res, text) {
  return res.some(re => { re.lastIndex = 0; return re.test(text); });
}

function extractJdKeywords(jd) {
  // Drop our saved-JD metadata header/footer and URLs so they can't pollute matches.
  const text = atsNormalize(
    String(jd || '')
      .replace(/^#.*$/gm, ' ')
      .replace(/^_.*_\s*$/gm, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
  );
  const out = [];
  for (const s of SKILLS_PRE) {
    const freq = countHits(s.res, text);
    if (freq > 0) {
      // Frequency = salience: a skill named repeatedly is more central to the role.
      out.push({ term: s.display, weight: 1 + Math.min(freq - 1, 3) * 0.5, res: s.res });
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

function computeAtsScore(jdText, resumeText) {
  if (!jdText || !resumeText) return null;
  const kws = extractJdKeywords(jdText);
  if (!kws.length) return null;
  const resumeNorm = atsNormalize(resumeText);
  const matched = [], missing = [];
  let got = 0, total = 0;
  for (const { term, weight, res } of kws) {
    total += weight;
    if (present(res, resumeNorm)) { got += weight; matched.push(term); }
    else missing.push(term);
  }
  return { score: Math.round((100 * got) / total), matched, missing, keyword_count: kws.length };
}

module.exports = { computeAtsScore, extractJdKeywords };
