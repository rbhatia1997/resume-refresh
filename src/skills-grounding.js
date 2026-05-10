const SKILL_VOCABULARY = [
  // ── Product Management ──────────────────────────────────────────────
  { canonical: "Product Strategy",        aliases: ["product strategy", "strategy"] },
  { canonical: "Roadmap Prioritization",  aliases: ["roadmap prioritization", "roadmap planning", "roadmapping", "roadmap"] },
  { canonical: "Experimentation",         aliases: ["experimentation", "a/b testing", "ab testing", "a/b tests"] },
  { canonical: "Product Analytics",       aliases: ["analytics", "product analytics", "data analysis", "metrics"] },
  { canonical: "Stakeholder Management",  aliases: ["stakeholder management", "stakeholder alignment", "cross-functional", "cross functional"] },
  { canonical: "User Research",           aliases: ["user research", "customer research", "ux research", "qualitative research", "usability testing"] },
  { canonical: "Onboarding",              aliases: ["onboarding", "user onboarding", "activation"] },
  { canonical: "Growth Strategy",         aliases: ["growth", "growth strategy", "growth marketing", "growth hacking"] },
  { canonical: "Monetization",            aliases: ["monetization", "pricing", "pricing strategy", "revenue strategy"] },
  { canonical: "Go-to-Market Strategy",   aliases: ["go to market", "go-to-market", "gtm", "launch strategy"] },
  { canonical: "Lifecycle Marketing",     aliases: ["lifecycle", "lifecycle marketing", "crm", "customer lifecycle"] },
  { canonical: "Product Discovery",       aliases: ["product discovery", "discovery", "problem discovery"] },
  { canonical: "OKRs",                    aliases: ["okrs", "okr", "kpis", "kpi"] },
  { canonical: "Agile",                   aliases: ["agile", "scrum", "sprint planning", "kanban", "agile methodology"] },
  { canonical: "Competitive Analysis",    aliases: ["competitive analysis", "competitive intelligence", "market research"] },
  { canonical: "AI Infrastructure",       aliases: ["ai infrastructure", "infrastructure systems", "datacenter", "data center", "nvidia", "h100", "h200", "gb200", "hpc", "high-performance computing", "liquid cooling", "pcie"] },

  // ── Engineering ─────────────────────────────────────────────────────
  { canonical: "Python",          aliases: ["python"] },
  { canonical: "JavaScript",      aliases: ["javascript", "js", "vanilla js"] },
  { canonical: "TypeScript",      aliases: ["typescript", "ts"] },
  { canonical: "React",           aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Node.js",         aliases: ["node", "node.js", "nodejs"] },
  { canonical: "Go",              aliases: ["golang", "go lang"] },
  { canonical: "Java",            aliases: ["java"] },
  { canonical: "C++",             aliases: ["c++", "cpp"] },
  { canonical: "C#",              aliases: ["c#", "csharp", ".net"] },
  { canonical: "Ruby",            aliases: ["ruby", "ruby on rails", "rails"] },
  { canonical: "Rust",            aliases: ["rust"] },
  { canonical: "Swift",           aliases: ["swift", "swiftui"] },
  { canonical: "Kotlin",          aliases: ["kotlin", "android"] },
  { canonical: "SQL",             aliases: ["sql", "postgres", "postgresql", "mysql", "sqlite"] },
  { canonical: "GraphQL",         aliases: ["graphql", "apollo"] },
  { canonical: "REST APIs",       aliases: ["rest", "rest api", "restful", "api design"] },
  { canonical: "AWS",             aliases: ["aws", "amazon web services", "ec2", "s3", "lambda", "eks"] },
  { canonical: "GCP",             aliases: ["gcp", "google cloud", "google cloud platform"] },
  { canonical: "Azure",           aliases: ["azure", "microsoft azure"] },
  { canonical: "Docker",          aliases: ["docker", "containerization", "containers"] },
  { canonical: "Kubernetes",      aliases: ["kubernetes", "k8s"] },
  { canonical: "Terraform",       aliases: ["terraform", "infrastructure as code", "iac"] },
  { canonical: "CI/CD",           aliases: ["ci/cd", "cicd", "continuous integration", "continuous deployment", "github actions", "jenkins"] },
  { canonical: "Git",             aliases: ["git", "github", "gitlab", "version control"] },
  { canonical: "Redis",           aliases: ["redis", "caching"] },
  { canonical: "Kafka",           aliases: ["kafka", "event streaming", "message queue"] },
  { canonical: "Machine Learning", aliases: ["machine learning", "ml", "deep learning", "neural networks"] },
  { canonical: "Data Engineering", aliases: ["data engineering", "data pipeline", "etl", "data warehouse"] },
  { canonical: "POS Systems",      aliases: ["pos systems", "point of sale", "point-of-sale", "pos"] },
  { canonical: "Networking",       aliases: ["networking", "network support", "network troubleshooting", "routers", "switches"] },
  { canonical: "Hardware Support", aliases: ["hardware support", "hardware troubleshooting", "computer hardware", "hardware"] },
  { canonical: "Technical Troubleshooting", aliases: ["technical troubleshooting", "troubleshooting", "diagnostics", "technical support"] },
  { canonical: "Windows",          aliases: ["windows", "windows support", "microsoft windows"] },
  { canonical: "macOS",            aliases: ["macos", "mac os", "apple support"] },
  { canonical: "Printers",         aliases: ["printers", "printer support", "peripherals"] },
  { canonical: "Mobile Devices",   aliases: ["mobile devices", "handheld devices", "mobile device support"] },
  { canonical: "Ticketing Systems", aliases: ["ticketing systems", "ticketing", "service desk tickets", "help desk tickets"] },

  // ── Data & Analytics ────────────────────────────────────────────────
  { canonical: "SQL",             aliases: ["sql"] },   // shared alias, deduped by Set
  { canonical: "Python",          aliases: ["pandas", "numpy", "scipy"] },
  { canonical: "Tableau",         aliases: ["tableau"] },
  { canonical: "Looker",          aliases: ["looker", "lookml"] },
  { canonical: "Power BI",        aliases: ["power bi", "powerbi"] },
  { canonical: "Amplitude",       aliases: ["amplitude"] },
  { canonical: "Mixpanel",        aliases: ["mixpanel"] },
  { canonical: "Google Analytics",aliases: ["google analytics", "ga4"] },
  { canonical: "dbt",             aliases: ["dbt", "data build tool"] },
  { canonical: "Spark",           aliases: ["spark", "pyspark", "apache spark"] },
  { canonical: "Airflow",         aliases: ["airflow", "apache airflow"] },
  { canonical: "Snowflake",       aliases: ["snowflake"] },
  { canonical: "BigQuery",        aliases: ["bigquery", "google bigquery"] },

  // ── Design / UX ─────────────────────────────────────────────────────
  { canonical: "Figma",           aliases: ["figma"] },
  { canonical: "Sketch",          aliases: ["sketch"] },
  { canonical: "Adobe XD",        aliases: ["adobe xd", "xd"] },
  { canonical: "Prototyping",     aliases: ["prototyping", "wireframing", "wireframes", "mockups"] },
  { canonical: "Design Systems",  aliases: ["design system", "design systems", "component library"] },
  { canonical: "UX Writing",      aliases: ["ux writing", "content design", "microcopy"] },
  { canonical: "Accessibility",   aliases: ["accessibility", "wcag", "a11y", "aria"] },

  // ── Marketing ───────────────────────────────────────────────────────
  { canonical: "SEO",             aliases: ["seo", "search engine optimization"] },
  { canonical: "SEM",             aliases: ["sem", "paid search", "google ads", "ppc"] },
  { canonical: "Email Marketing", aliases: ["email marketing", "drip campaigns", "email automation"] },
  { canonical: "Content Marketing",aliases: ["content marketing", "content strategy", "blog"] },
  { canonical: "Social Media",    aliases: ["social media", "social media marketing", "instagram", "tiktok", "twitter"] },
  { canonical: "Marketing Automation", aliases: ["marketing automation", "hubspot", "marketo", "pardot"] },
  { canonical: "Paid Social",     aliases: ["paid social", "facebook ads", "meta ads", "linkedin ads"] },
  { canonical: "Attribution",     aliases: ["attribution", "marketing attribution", "mmm"] },

  // ── Project / Program Management ─────────────────────────────────────
  { canonical: "Jira",            aliases: ["jira", "confluence"] },
  { canonical: "Asana",           aliases: ["asana"] },
  { canonical: "Linear",          aliases: ["linear"] },
  { canonical: "Monday.com",      aliases: ["monday", "monday.com"] },
  { canonical: "Notion",          aliases: ["notion"] },
  { canonical: "Program Management", aliases: ["program management", "project management", "pmp"] },
  { canonical: "Risk Management", aliases: ["risk management", "risk mitigation"] },
  { canonical: "Process Improvement", aliases: ["process improvement", "process optimization", "lean", "six sigma"] },

  // ── Finance ─────────────────────────────────────────────────────────
  { canonical: "Financial Modeling", aliases: ["financial modeling", "financial model", "excel modeling"] },
  { canonical: "Forecasting",     aliases: ["forecasting", "financial forecasting", "budgeting"] },
  { canonical: "FP&A",            aliases: ["fp&a", "financial planning", "financial analysis"] },
  { canonical: "Excel",           aliases: ["excel", "microsoft excel", "spreadsheets", "google sheets"] },
  { canonical: "Valuation",       aliases: ["valuation", "dcf", "financial valuation"] },

  // ── Sales ────────────────────────────────────────────────────────────
  { canonical: "Salesforce",      aliases: ["salesforce", "sfdc", "crm"] },
  { canonical: "Account Management", aliases: ["account management", "account executive", "customer success"] },
  { canonical: "Pipeline Management", aliases: ["pipeline management", "sales pipeline", "deal flow"] },
  { canonical: "Enterprise Sales", aliases: ["enterprise sales", "b2b sales", "saas sales"] },
  { canonical: "Contract Negotiation", aliases: ["contract negotiation", "deal negotiation"] },
];

const ROLE_SKILL_PRIORITIES = [
  {
    pattern: /ai infrastructure|infrastructure product|hardware product|hpc/i,
    preferred: [
      "AI Infrastructure", "Product Strategy", "Product Analytics", "Experimentation",
      "Go-to-Market Strategy", "Stakeholder Management", "Roadmap Prioritization",
      "Growth Strategy", "User Research", "SQL"
    ]
  },
  {
    pattern: /product manager|product management|pm\b/i,
    preferred: [
      "Product Strategy", "Roadmap Prioritization", "Experimentation", "Product Analytics",
      "SQL", "Stakeholder Management", "User Research", "Growth Strategy",
      "Go-to-Market Strategy", "Product Discovery", "Monetization", "Competitive Analysis"
    ]
  },
  {
    pattern: /software engineer|backend engineer|frontend engineer|full.?stack/i,
    preferred: [
      "Python", "JavaScript", "TypeScript", "Node.js", "React", "SQL",
      "AWS", "Docker", "Kubernetes", "CI/CD", "REST APIs", "Git"
    ]
  },
  {
    pattern: /it support|help.?desk|desktop support|technical support|field technician/i,
    preferred: [
      "Technical Troubleshooting", "POS Systems", "Networking", "Hardware Support",
      "Windows", "Printers", "Mobile Devices", "Ticketing Systems", "Git"
    ]
  },
  {
    pattern: /data scientist|ml engineer|machine learning/i,
    preferred: [
      "Python", "Machine Learning", "SQL", "Data Engineering", "Spark",
      "AWS", "Tableau", "dbt", "Snowflake", "BigQuery"
    ]
  },
  {
    pattern: /data analyst|analytics engineer|business analyst/i,
    preferred: [
      "SQL", "Python", "Tableau", "Looker", "Power BI", "Google Analytics",
      "Snowflake", "BigQuery", "dbt", "Excel", "Product Analytics"
    ]
  },
  {
    pattern: /ux|product design|ui design/i,
    preferred: [
      "Figma", "Prototyping", "User Research", "Design Systems",
      "Accessibility", "Sketch", "UX Writing"
    ]
  },
  {
    pattern: /marketing|growth|demand gen/i,
    preferred: [
      "SEO", "SEM", "Email Marketing", "Content Marketing", "Marketing Automation",
      "Paid Social", "Google Analytics", "Attribution", "Lifecycle Marketing"
    ]
  },
  {
    pattern: /account executive|enterprise sales|saas sales/i,
    preferred: [
      "Salesforce", "Pipeline Management", "Enterprise Sales", "Account Management",
      "Contract Negotiation", "Stakeholder Management"
    ]
  },
  {
    pattern: /program manager|project manager|chief of staff/i,
    preferred: [
      "Program Management", "Agile", "Jira", "OKRs", "Stakeholder Management",
      "Risk Management", "Process Improvement", "Notion"
    ]
  },
];

const ROLE_LOW_SIGNAL_SKILLS = [
  {
    pattern: /product manager|product management|pm\b|ai infrastructure|infrastructure product|hardware product|hpc/i,
    skills: new Set(["Jira", "OKRs", "Agile", "Figma"])
  }
];

const GENERIC_REJECTION_PATTERNS = [
  /\b(communication|communicator|storytelling|leadership|problem solving|hardworking|detail oriented|team player)\b/i,
  /\b(experience|professional|results|ownership|collaboration)\b/i
];

const aliasToCanonical = new Map();
for (const skill of SKILL_VOCABULARY) {
  for (const alias of skill.aliases) {
    aliasToCanonical.set(alias, skill.canonical);
  }
}

function normalizeToken(value = "") {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[|/]/g, " ")
    .replace(/[^a-z0-9+#.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSkillChunks(text = "") {
  return String(text)
    .split(/\n|[;,]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function resolveRecognizedSkill(rawValue = "") {
  const normalized = normalizeToken(rawValue);
  if (!normalized) {
    return [];
  }

  const direct = aliasToCanonical.get(normalized);
  if (direct) {
    return [direct];
  }

  const matches = [];
  for (const [alias, canonical] of aliasToCanonical.entries()) {
    const pattern = new RegExp(`(^|\\b)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|$)`, "i");
    if (pattern.test(normalized)) {
      matches.push(canonical);
    }
  }

  return [...new Set(matches)];
}

export function normalizeSkillLines(text = "") {
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const rawChunk of parseSkillChunks(text)) {
    const recognized = resolveRecognizedSkill(rawChunk);
    if (recognized.length) {
      for (const skill of recognized) {
        if (!seen.has(skill)) {
          accepted.push(skill);
          seen.add(skill);
        }
      }
      continue;
    }

    if (GENERIC_REJECTION_PATTERNS.some((pattern) => pattern.test(rawChunk))) {
      rejected.push({ value: rawChunk.trim(), reason: "generic or trait-like" });
      continue;
    }

    rejected.push({ value: rawChunk.trim(), reason: "not recognized as a recruiter-facing skill" });
  }

  return { accepted, rejected };
}

function getRolePriorityList(targetRole = "") {
  return ROLE_SKILL_PRIORITIES.find((entry) => entry.pattern.test(targetRole || ""))?.preferred || [];
}

function getRoleLowSignalSkills(targetRole = "") {
  return ROLE_LOW_SIGNAL_SKILLS.find((entry) => entry.pattern.test(targetRole || ""))?.skills || new Set();
}

export function buildSkillActionPreview({
  action,
  currentText = "",
  targetRole = "",
  supportingText = ""
}) {
  const current = normalizeSkillLines(currentText);
  const supporting = normalizeSkillLines(supportingText);
  const rolePreferred = getRolePriorityList(targetRole);
  const lowSignal = getRoleLowSignalSkills(targetRole);

  const ranked = new Map();
  for (const skill of current.accepted) {
    ranked.set(skill, (ranked.get(skill) || 0) + 3);
  }
  for (const skill of supporting.accepted) {
    ranked.set(skill, (ranked.get(skill) || 0) + 2);
  }
  for (const skill of rolePreferred) {
    ranked.set(skill, (ranked.get(skill) || 0) + (action === "align" ? 4 : 1));
  }

  const suggested = [...ranked.entries()]
    .filter(([skill]) => !lowSignal.has(skill))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([skill]) => skill)
    .slice(0, action === "align" ? 10 : 8);

  const removed = [
    ...current.rejected,
    ...current.accepted
      .filter((skill) => !suggested.includes(skill))
      .map((skill) => ({ value: skill, reason: action === "align" ? `lower priority for ${targetRole || "this role"}` : "weaker or redundant compared with stronger skills" }))
  ];

  return {
    action,
    suggested,
    removed,
    supportingMatches: supporting.accepted.filter((skill) => suggested.includes(skill))
  };
}
