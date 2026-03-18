const SECTION_IDS = ["header", "summary", "experience", "skills", "education", "projects", "certifications", "community", "interests"];

const HEADING_ALIASES = {
  summary: ["summary", "professional summary", "profile", "about", "about me"],
  experience: ["experience", "work experience", "employment", "professional experience"],
  skills: ["skills", "core skills", "technical skills", "core competencies"],
  education: ["education", "academic background"],
  projects: ["projects", "selected projects"],
  certifications: ["certifications", "licenses"],
  community: ["community", "volunteering", "volunteer"],
  interests: ["interests"]
};

const DEGREE_PATTERN = /\b(B\.?A\.?|B\.?S\.?|M\.?A\.?|M\.?S\.?|MBA|Ph\.?D\.?|Bachelor|Master|Associate)\b/i;
const SCHOOL_PATTERN = /\b(university|college|school|academy|institute)\b/i;
const DATE_PATTERN = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/i;
const BULLET_PATTERN = /^[-*•]\s+/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+\b/i;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;
const NAME_PATTERN = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;
const LOCATION_PATTERN = /^(?:[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*,\s*)?(?:AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)(?:\s+\d{5})?$/i;

const JUNK_PATTERNS = [
  /^see more$/i,
  /^see less$/i,
  /^connect$/i,
  /^message$/i,
  /^follow$/i,
  /^followers?$/i,
  /^\d+\+?\s+followers?$/i,
  /^open to work$/i,
  /^job alert$/i,
  /^easy apply$/i,
  /^apply now$/i,
  /^recommended for you$/i,
  /^shared by .+$/i,
  /^like$/i,
  /^comment$/i,
  /^send profile in a message$/i,
  /^show credential$/i,
  /^more profiles for you$/i,
  / logo$/i
];

const WEAK_SKILL_PATTERNS = [
  /^communication$/i,
  /^teamwork$/i,
  /^leadership$/i,
  /^problem solving$/i,
  /^microsoft office$/i,
  /^detail oriented$/i
];

const CANONICAL_SKILLS = new Map([
  ["product strategy", { canonical: "Product Strategy", roles: ["product manager", "senior product manager"] }],
  ["roadmapping", { canonical: "Roadmapping", roles: ["product manager", "senior product manager"] }],
  ["prioritization", { canonical: "Prioritization", roles: ["product manager", "senior product manager"] }],
  ["stakeholder management", { canonical: "Stakeholder Management", roles: ["product manager", "senior product manager", "customer success manager"] }],
  ["experimentation", { canonical: "Experimentation", roles: ["product manager", "growth product manager", "senior product manager", "data"] }],
  ["a/b testing", { canonical: "A/B Testing", roles: ["product manager", "growth product manager", "marketing"] }],
  ["user research", { canonical: "User Research", roles: ["product manager", "designer"] }],
  ["sql", { canonical: "SQL", roles: ["product manager", "senior product manager", "data", "analyst"] }],
  ["analytics", { canonical: "Analytics", roles: ["product manager", "data", "analyst"] }],
  ["data analysis", { canonical: "Data Analysis", roles: ["data", "analyst", "product manager"] }],
  ["lifecycle marketing", { canonical: "Lifecycle Marketing", roles: ["growth product manager", "marketing"] }],
  ["pricing & packaging", { canonical: "Pricing & Packaging", roles: ["product manager", "senior product manager"] }],
  ["go-to-market", { canonical: "Go-to-Market Strategy", roles: ["product manager", "marketing"] }],
  ["agile", { canonical: "Agile", roles: ["product manager", "engineer"] }],
  ["scrum", { canonical: "Scrum", roles: ["product manager", "engineer"] }],
  ["jira", { canonical: "Jira", roles: ["product manager", "engineer"] }],
  ["figma", { canonical: "Figma", roles: ["designer", "product manager"] }],
  ["user-centered design", { canonical: "User-Centered Design", roles: ["designer", "product manager"] }],
  ["product management", { canonical: "Product Management", roles: ["product manager", "senior product manager"] }],
  ["customer discovery", { canonical: "Customer Discovery", roles: ["product manager", "founder"] }],
  ["wireframing", { canonical: "Wireframing", roles: ["designer", "product manager"] }],
  ["tableau", { canonical: "Tableau", roles: ["data", "analyst"] }],
  ["python", { canonical: "Python", roles: ["data", "engineer"] }],
  ["react", { canonical: "React", roles: ["engineer"] }],
  ["node.js", { canonical: "Node.js", roles: ["engineer"] }]
]);

const SKILL_ALIASES = new Map([
  ["product management", "product management"],
  ["product manager", "product management"],
  ["sql", "sql"],
  ["structured query language", "sql"],
  ["ab testing", "a/b testing"],
  ["a/b testing", "a/b testing"],
  ["user centered design", "user-centered design"],
  ["go to market", "go-to-market"],
  ["gtm", "go-to-market"],
  ["roadmap", "roadmapping"],
  ["roadmapping", "roadmapping"],
  ["prioritization", "prioritization"],
  ["prioritisation", "prioritization"],
  ["stakeholder mgmt", "stakeholder management"],
  ["stakeholder management", "stakeholder management"],
  ["stakeholder alignment", "stakeholder management"],
  ["exp", "experimentation"],
  ["experimentation", "experimentation"],
  ["analytics", "analytics"],
  ["data analytics", "analytics"],
  ["pricing and packaging", "pricing & packaging"],
  ["pricing & packaging", "pricing & packaging"],
  ["lifecycle", "lifecycle marketing"],
  ["user research", "user research"],
  ["customer research", "user research"],
  ["sql", "sql"],
  ["jira", "jira"]
]);

const ROLE_SKILL_PREFERENCES = [
  ["senior product manager", ["Product Strategy", "Roadmapping", "Prioritization", "Stakeholder Management", "Experimentation", "A/B Testing", "Analytics", "SQL", "User Research", "Pricing & Packaging", "Go-to-Market Strategy", "Jira"]],
  ["product manager", ["Product Strategy", "Roadmapping", "Prioritization", "Stakeholder Management", "Experimentation", "Analytics", "SQL", "User Research", "Jira"]],
  ["designer", ["User-Centered Design", "Figma", "User Research", "Wireframing"]],
  ["engineer", ["React", "Node.js", "Python", "SQL", "Agile", "Scrum"]],
  ["data", ["SQL", "Python", "Analytics", "Data Analysis", "Tableau", "Experimentation"]]
];
const IMPLICIT_SKILL_EXCLUSIONS = new Set(["product management"]);

function normalizeText(value = "") {
  return value
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[•▪◦]/g, "•")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSkillChipText(line) {
  return line
    .replace(/\s+and\s+\+\d+\s+skills?/gi, "")
    .replace(/\s+\+\d+\s+skills?/gi, "")
    .trim();
}

function isContactLine(line) {
  return EMAIL_PATTERN.test(line) || URL_PATTERN.test(line) || PHONE_PATTERN.test(line) || /\blinkedin\.com\//i.test(line);
}

function isLocationLine(line) {
  return LOCATION_PATTERN.test(line.trim());
}

function isLikelyNameLine(line) {
  const normalized = line.trim();
  if (!normalized || /[,|@/]/.test(normalized) || isLocationLine(normalized) || isContactLine(normalized)) {
    return false;
  }
  return NAME_PATTERN.test(normalized);
}

function isJunkLine(line) {
  if (!line) return true;
  const normalized = line.trim();
  if (!normalized) return true;
  return JUNK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizedHeading(line) {
  const cleaned = line.trim().replace(/:$/, "").toLowerCase();
  for (const [sectionId, aliases] of Object.entries(HEADING_ALIASES)) {
    if (aliases.includes(cleaned)) {
      return sectionId;
    }
  }
  return "";
}

function splitAndCleanLines(text) {
  const deduped = [];
  const seenShort = new Set();
  const pushLogicalLine = (value = "") => {
    let line = cleanSkillChipText(value.trim());
    if (!line) return;
    if (isJunkLine(line)) return;

    line = line.replace(/\s*[|·]\s*/g, " | ");
    line = line.replace(/^\s*[-*]\s*/, "- ");
    line = line.replace(/^•\s*/, "- ");

    const shortKey = line.toLowerCase();
    if (line.length <= 40) {
      if (seenShort.has(shortKey)) return;
      seenShort.add(shortKey);
    }

    if (deduped[deduped.length - 1]?.toLowerCase() === shortKey) return;
    deduped.push(line);
  };

  const rawLines = normalizeText(text).split("\n");
  let currentBullet = "";
  let currentParagraph = "";
  let previousWasBlank = true;

  const flushBullet = () => {
    if (!currentBullet) return;
    pushLogicalLine(currentBullet);
    currentBullet = "";
  };

  const flushParagraph = () => {
    if (!currentParagraph) return;
    pushLogicalLine(currentParagraph);
    currentParagraph = "";
  };

  for (const rawLine of rawLines) {
    const trimmed = cleanSkillChipText(rawLine.trim());
    if (!trimmed) {
      flushBullet();
      flushParagraph();
      previousWasBlank = true;
      continue;
    }
    if (isJunkLine(trimmed)) continue;

    const line = trimmed
      .replace(/\s*[|·]\s*/g, " | ")
      .replace(/^\s*[-*]\s*/, "- ")
      .replace(/^•\s*/, "- ");

    if (normalizedHeading(line)) {
      flushBullet();
      flushParagraph();
      pushLogicalLine(line);
      previousWasBlank = true;
      continue;
    }

    if (BULLET_PATTERN.test(line)) {
      flushBullet();
      flushParagraph();
      currentBullet = line;
      previousWasBlank = false;
      continue;
    }

    if (currentBullet) {
      currentBullet = `${currentBullet} ${line.replace(/^[-*•]\s*/, "")}`.trim();
      previousWasBlank = false;
      continue;
    }

    const currentIsStandalone = isLikelyNameLine(line) || isLocationLine(line) || isContactLine(line);
    const paragraphIsStandalone = isLikelyNameLine(currentParagraph) || isLocationLine(currentParagraph) || isContactLine(currentParagraph);
    const looksLikeContinuation = !previousWasBlank && currentParagraph && !currentIsStandalone && !paragraphIsStandalone && (/^[a-z(]/.test(line) || /[,:-]$/.test(currentParagraph));

    if (looksLikeContinuation) {
      currentParagraph = `${currentParagraph} ${line}`.trim();
    } else {
      flushParagraph();
      currentParagraph = line;
    }

    previousWasBlank = false;
  }

  flushBullet();
  flushParagraph();

  return deduped;
}

function baseSectionMap() {
  return {
    header: [],
    summary: [],
    experience: [],
    skills: [],
    education: [],
    projects: [],
    certifications: [],
    community: [],
    interests: []
  };
}

function looksLikeHeaderLine(line) {
  return isLikelyNameLine(line) || isContactLine(line) || isLocationLine(line);
}

function looksLikeEducationLine(line) {
  return DEGREE_PATTERN.test(line) || SCHOOL_PATTERN.test(line);
}

function looksLikeExperienceLine(line) {
  return BULLET_PATTERN.test(line) || DATE_PATTERN.test(line) || /\b(at|manager|lead|director|engineer|analyst|product|marketing|sales)\b/i.test(line);
}

function tokenizeSkills(line) {
  return line
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !WEAK_SKILL_PATTERNS.some((pattern) => pattern.test(item)));
}

function skillMatchesLine(line, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(line);
}

function canonicalizeSkill(skill) {
  const normalized = skill
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const alias = SKILL_ALIASES.get(normalized) || normalized;
  return CANONICAL_SKILLS.get(alias)?.canonical || "";
}

function scoreSkillForRole(skill, targetRole = "") {
  const normalizedRole = targetRole.toLowerCase();
  const meta = [...CANONICAL_SKILLS.values()].find((item) => item.canonical === skill);
  if (!meta) return 1;
  let score = 1;
  const preferredOrder = ROLE_SKILL_PREFERENCES.find(([role]) => normalizedRole.includes(role))?.[1] || [];
  const preferredIndex = preferredOrder.indexOf(skill);
  if (preferredIndex >= 0) {
    score += 10 - Math.min(preferredIndex, 9);
  }
  if (meta.roles.some((role) => normalizedRole.includes(role))) score += 4;
  if (normalizedRole.includes(skill.toLowerCase())) score += 2;
  return score;
}

export function normalizeSkillEntries(input = "") {
  const entries = tokenizeSkills(input)
    .flatMap((item) => item.split(/\n/))
    .map((item) => item.trim())
    .filter(Boolean);
  const deduped = new Set();
  const normalized = [];
  for (const entry of entries) {
    const canonical = canonicalizeSkill(entry);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (deduped.has(key)) continue;
    deduped.add(key);
    normalized.push(canonical);
  }
  return normalized;
}

export function trimWeakSkillsList(input = "") {
  return normalizeSkillEntries(input);
}

export function alignSkillsToRoleList(input = "", targetRole = "") {
  const normalized = normalizeSkillEntries(input);
  const normalizedRole = targetRole.toLowerCase();
  const preferredOrder = ROLE_SKILL_PREFERENCES.find(([role]) => normalizedRole.includes(role))?.[1] || [];
  const prioritizedAnchors = preferredOrder.slice(0, 5);
  const result = [];
  const seen = new Set();

  for (const skill of prioritizedAnchors) {
    if (!seen.has(skill.toLowerCase())) {
      seen.add(skill.toLowerCase());
      result.push(skill);
    }
  }

  for (const skill of [...normalized].sort((left, right) => {
    return scoreSkillForRole(right, targetRole) - scoreSkillForRole(left, targetRole) || left.localeCompare(right);
  })) {
    if (seen.has(skill.toLowerCase())) continue;
    seen.add(skill.toLowerCase());
    result.push(skill);
  }

  return result;
}

function pushUnique(target, value) {
  const normalized = value.trim();
  if (!normalized) return;
  if (target.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
  target.push(normalized);
}

function classifyLooseBlock(lines, sections) {
  const joined = lines.join("\n");
  if (!joined.trim()) return;

  if (lines.every((line) => line.includes("|") || line.includes(",") || WEAK_SKILL_PATTERNS.some((pattern) => pattern.test(line)))) {
    for (const line of lines) {
      for (const skill of tokenizeSkills(line)) {
        pushUnique(sections.skills, skill);
      }
    }
    return;
  }

  if (lines.some((line) => looksLikeEducationLine(line))) {
    for (const line of lines) {
      pushUnique(sections.education, line);
    }
    return;
  }

  if (lines.some((line) => /\b(project|case study|portfolio)\b/i.test(line))) {
    for (const line of lines) {
      pushUnique(sections.projects, line);
    }
    return;
  }

  if (lines.some((line) => /\b(certified|certification|license)\b/i.test(line))) {
    for (const line of lines) {
      pushUnique(sections.certifications, line);
    }
    return;
  }

  if (lines.some((line) => looksLikeExperienceLine(line))) {
    for (const line of lines) {
      pushUnique(sections.experience, line);
    }
    return;
  }

  if (!sections.summary.length) {
    pushUnique(sections.summary, lines.join(" "));
  }
}

function enrichSkillsFromSignals(sections) {
  const inferred = [];
  const signalSources = [
    ...sections.summary,
    ...sections.experience,
    ...sections.projects,
    ...sections.certifications
  ];

  for (const line of signalSources) {
    const normalizedLine = line.toLowerCase();
    for (const [alias, canonicalKey] of SKILL_ALIASES.entries()) {
      if (skillMatchesLine(normalizedLine, alias)) {
        if (IMPLICIT_SKILL_EXCLUSIONS.has(canonicalKey)) continue;
        const canonical = CANONICAL_SKILLS.get(canonicalKey)?.canonical;
        if (canonical) {
          pushUnique(inferred, canonical);
        }
      }
    }
    for (const [canonicalKey, meta] of CANONICAL_SKILLS.entries()) {
      if (IMPLICIT_SKILL_EXCLUSIONS.has(canonicalKey)) continue;
      if (skillMatchesLine(normalizedLine, canonicalKey)) {
        pushUnique(inferred, meta.canonical);
      }
    }
  }

  for (const skill of inferred) {
    pushUnique(sections.skills, skill);
  }
}

function organizeHeaderLines(lines) {
  const names = [];
  const contacts = [];
  const locations = [];
  const others = [];

  for (const line of lines) {
    if (isLikelyNameLine(line)) {
      pushUnique(names, line);
    } else if (isContactLine(line)) {
      pushUnique(contacts, line);
    } else if (isLocationLine(line)) {
      pushUnique(locations, line);
    } else {
      pushUnique(others, line);
    }
  }

  return [...names, ...contacts, ...locations, ...others];
}

function parseLinesIntoSections(lines, linkedinUrl = "") {
  const sections = baseSectionMap();
  let currentSection = "header";
  let looseBlock = [];

  const flushLooseBlock = () => {
    if (!looseBlock.length) return;
    classifyLooseBlock(looseBlock, sections);
    looseBlock = [];
  };

  for (const line of lines) {
    const heading = normalizedHeading(line);
    if (heading) {
      flushLooseBlock();
      currentSection = heading;
      continue;
    }

    if (currentSection === "header") {
      if (looksLikeHeaderLine(line) || (!sections.header.length && NAME_PATTERN.test(line))) {
        pushUnique(sections.header, line);
        continue;
      }

      if (!sections.summary.length && !looksLikeExperienceLine(line) && !looksLikeEducationLine(line)) {
        pushUnique(sections.summary, line);
        continue;
      }

      looseBlock.push(line);
      continue;
    }

    if (currentSection === "skills") {
      const skillTokens = normalizeSkillEntries(line);
      if (skillTokens.length) {
        for (const token of skillTokens) {
          pushUnique(sections.skills, token);
        }
      }
      continue;
    }

    if (currentSection === "summary") {
      if (looksLikeEducationLine(line) || normalizedHeading(line)) {
        flushLooseBlock();
      }
      pushUnique(sections.summary, line);
      continue;
    }

    if (currentSection === "experience") {
      if (looksLikeEducationLine(line) && !DATE_PATTERN.test(line)) {
        currentSection = "education";
        pushUnique(sections.education, line);
        continue;
      }
      pushUnique(sections.experience, line);
      continue;
    }

    if (currentSection === "education") {
      pushUnique(sections.education, line);
      continue;
    }

    if (currentSection === "projects") {
      pushUnique(sections.projects, line);
      continue;
    }

    if (currentSection === "certifications") {
      pushUnique(sections.certifications, line);
      continue;
    }

    if (currentSection === "community") {
      pushUnique(sections.community, line);
      continue;
    }

    if (currentSection === "interests") {
      pushUnique(sections.interests, line);
      continue;
    }
  }

  flushLooseBlock();

  if (linkedinUrl) {
    pushUnique(sections.header, linkedinUrl);
  }

  if (!sections.header.length) {
    for (const line of lines.slice(0, 5)) {
      if (looksLikeHeaderLine(line)) {
        pushUnique(sections.header, line);
      }
    }
  }

  if (!sections.summary.length) {
    const summaryCandidates = lines.filter((line) => !looksLikeHeaderLine(line) && !looksLikeEducationLine(line) && !looksLikeExperienceLine(line));
    if (summaryCandidates.length) {
      pushUnique(sections.summary, summaryCandidates.slice(0, 2).join(" "));
    }
  }

  enrichSkillsFromSignals(sections);
  sections.header = organizeHeaderLines(sections.header);

  return sections;
}

function inferConfidence(content, sectionId) {
  if (!content.trim()) return "low";
  if (sectionId === "header") return content.split("\n").length >= 2 ? "high" : "medium";
  if (sectionId === "experience") return /-\s|\b\d{4}\b/.test(content) ? "high" : "medium";
  if (sectionId === "education") return SCHOOL_PATTERN.test(content) || DEGREE_PATTERN.test(content) ? "high" : "medium";
  if (sectionId === "skills") return content.split("\n").length >= 2 ? "high" : "medium";
  return content.length > 40 ? "high" : "medium";
}

export function parseImportedSections({ linkedinUrl = "", linkedinText = "", resumeText = "" } = {}) {
  const mergedText = [resumeText, linkedinText].filter(Boolean).join("\n\n");
  const cleanedLines = splitAndCleanLines(mergedText);
  const parsed = parseLinesIntoSections(cleanedLines, linkedinUrl.trim());

  const sections = Object.fromEntries(
    SECTION_IDS.map((sectionId) => {
      const content = parsed[sectionId].join("\n").trim();
      return [sectionId, {
        content,
        confidence: inferConfidence(content, sectionId),
        sourceHint: linkedinText.trim()
          ? "Parsed from pasted profile text"
          : "Parsed from imported resume content"
      }];
    })
  );

  return {
    cleanedText: cleanedLines.join("\n"),
    sections
  };
}
