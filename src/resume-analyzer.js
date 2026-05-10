import { extractContactInfo } from "./contact-info.js";
import { formatExperienceEntryHeading, parseExperienceEntries } from "./experience-entries.js";
import {
  buildContactSuggestions,
  buildEducationSuggestions,
  buildExperienceSuggestions,
  buildSkillsSuggestions,
  buildSummarySuggestions
} from "./section-suggestions.js";

const SECTION_HEADERS = [
  "summary",
  "professional summary",
  "profile",
  "about",
  "experience",
  "work experience",
  "employment",
  "experience highlights",
  "projects",
  "education",
  "skills",
  "core skills",
  "technical skills",
  "core competencies",
  "certifications",
  "awards",
  "volunteer",
  "hobbies",
  "interests",
  "languages",
  "publications",
  "research",
  "coursework",
  "licenses",
  "licensure",
  "community",
  "community involvement",
  "extracurriculars",
  "activities",
  "military service",
  "professional development",
  "training",
  "portfolio"
];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "have", "will",
  "into", "about", "after", "before", "over", "under", "across", "through",
  "you", "they", "them", "their", "ours", "ourselves", "my", "our", "was",
  "were", "are", "been", "being", "has", "had", "did", "does", "doing", "not",
  "but", "out", "all", "any", "per", "via", "using", "use", "used", "than",
  "then", "also", "can", "may", "should", "would", "could", "who", "what",
  "when", "where", "why", "how", "its", "it", "in", "on", "at", "to", "of",
  "a", "an", "as", "or", "by"
]);

// Infinitive → past tense map. Used to convert present-tense bullet openers to past.
const INFINITIVE_TO_PAST = {
  "achieve": "Achieved", "align": "Aligned", "analyze": "Analyzed",
  "architect": "Architected", "assess": "Assessed", "automate": "Automated",
  "build": "Built", "champion": "Championed", "coach": "Coached",
  "collaborate": "Collaborated", "communicate": "Communicated",
  "consolidate": "Consolidated", "coordinate": "Coordinated",
  "create": "Created", "cultivate": "Cultivated", "define": "Defined",
  "deliver": "Delivered", "design": "Designed", "develop": "Developed",
  "direct": "Directed", "document": "Documented", "drive": "Drove",
  "empower": "Empowered", "enable": "Enabled", "establish": "Established",
  "evaluate": "Evaluated", "execute": "Executed", "expand": "Expanded",
  "experiment": "Experimented", "facilitate": "Facilitated", "foster": "Fostered",
  "generate": "Generated", "grow": "Grew", "guide": "Guided",
  "hire": "Hired", "identify": "Identified", "implement": "Implemented",
  "improve": "Improved", "increase": "Increased", "influence": "Influenced",
  "integrate": "Integrated", "introduce": "Introduced", "launch": "Launched",
  "lead": "Led", "leverage": "Leveraged", "manage": "Managed",
  "mentor": "Mentored", "negotiate": "Negotiated", "optimize": "Optimized",
  "orchestrate": "Orchestrated", "oversee": "Oversaw", "own": "Owned",
  "partner": "Partnered", "plan": "Planned", "present": "Presented",
  "prioritize": "Prioritized", "produce": "Produced", "recruit": "Recruited",
  "reduce": "Reduced", "research": "Researched", "restructure": "Restructured",
  "review": "Reviewed", "scale": "Scaled", "shape": "Shaped",
  "ship": "Shipped", "simplify": "Simplified", "solve": "Solved",
  "spearhead": "Spearheaded", "streamline": "Streamlined", "support": "Supported",
  "transform": "Transformed", "unify": "Unified", "validate": "Validated",
};

// Gerund → past tense map. Used when bullet starts with "worked on [gerund]...".
const GERUND_TO_PAST = {
  "achieving": "Achieved", "aligning": "Aligned", "analyzing": "Analyzed",
  "architecting": "Architected", "assessing": "Assessed", "automating": "Automated",
  "building": "Built", "championing": "Championed", "coaching": "Coached",
  "collaborating": "Collaborated", "communicating": "Communicated",
  "consolidating": "Consolidated", "coordinating": "Coordinated",
  "creating": "Created", "cultivating": "Cultivated", "defining": "Defined",
  "delivering": "Delivered", "designing": "Designed", "developing": "Developed",
  "directing": "Directed", "documenting": "Documented", "driving": "Drove",
  "empowering": "Empowered", "enabling": "Enabled", "establishing": "Established",
  "evaluating": "Evaluated", "executing": "Executed", "expanding": "Expanded",
  "experimenting": "Experimented", "facilitating": "Facilitated", "fostering": "Fostered",
  "generating": "Generated", "growing": "Grew", "guiding": "Guided",
  "hiring": "Hired", "identifying": "Identified", "implementing": "Implemented",
  "improving": "Improved", "increasing": "Increased", "influencing": "Influenced",
  "integrating": "Integrated", "introducing": "Introduced", "launching": "Launched",
  "leading": "Led", "leveraging": "Leveraged", "managing": "Managed",
  "mentoring": "Mentored", "negotiating": "Negotiated", "optimizing": "Optimized",
  "orchestrating": "Orchestrated", "overseeing": "Oversaw", "owning": "Owned",
  "partnering": "Partnered", "planning": "Planned", "presenting": "Presented",
  "prioritizing": "Prioritized", "producing": "Produced", "recruiting": "Recruited",
  "reducing": "Reduced", "researching": "Researched", "restructuring": "Restructured",
  "reviewing": "Reviewed", "scaling": "Scaled", "shaping": "Shaped",
  "shipping": "Shipped", "simplifying": "Simplified", "solving": "Solved",
  "spearheading": "Spearheaded", "streamlining": "Streamlined", "supporting": "Supported",
  "transforming": "Transformed", "unifying": "Unified", "validating": "Validated",
  "running": "Ran", "building": "Built", "leading": "Led",
};

// Irregular past tense verbs that are already correct resume openers.
const IRREGULAR_PAST_VERBS = new Set([
  "led", "built", "ran", "drove", "grew", "wrote", "sold", "won", "cut",
  "set", "put", "got", "made", "spent", "kept", "held", "brought", "taught",
  "caught", "found", "sent", "gave", "took", "left", "met", "stood",
  "oversaw", "overcame", "spearheaded", "orchestrated",
]);

const WEAK_STARTER_PATTERN = /^(helped|helped with|worked on|responsible for|assisted|assisted with|supported|tasked with)\b/i;

// ── Unlabeled summary detection ───────────────────────────────────

/**
 * Returns true if a header line is clearly contact/identity information
 * rather than positioning/summary prose.
 */
function isContactInfoLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/@/.test(t)) return true;                                      // email
  if (/^https?:|^www\./i.test(t)) return true;                      // URL
  if (/linkedin\.com|github\.com|twitter\.com/i.test(t)) return true; // social
  if (/\d{3}[-.\s]\d{3,4}[-.\s]\d{4}/.test(t)) return true;        // phone
  // Multi-field separator lines like "email | phone | city"
  if (t.split(/[|·,]/).filter(Boolean).length >= 3) return true;
  return false;
}

/**
 * Scan header lines for an unlabeled professional positioning statement.
 *
 * A positioning statement is a prose line that:
 *   - Is ≥40 characters (not a short name/location fragment)
 *   - Contains professional role/domain language
 *   - Is NOT contact info, a name, or a multi-field separator line
 *
 * Returns the lines to treat as the summary (may be empty).
 */
function extractUnlabeledSummaryFromHeader(headerLines) {
  const POSITIONING_RE = /\b(year|experience|expertise|background|speciali|professional|manager|engineer|analyst|designer|developer|scientist|consultant|director|specialist|coordinator|strategist|marketing|sales|finance|operations|product|software|data|full.?stack|startup|passionate|driven|focused|delivering|building|leading|growing)\b/i;

  const posLines = [];
  for (const raw of headerLines) {
    const t = raw.trim();
    if (!t) continue;
    if (isContactInfoLine(t)) continue;
    // Pure name line: 2-4 capitalized words, short, no positioning signals
    if (/^[A-Z][a-z'-]+(\s+[A-Z][a-z'-]+){1,3}$/.test(t) && t.length < 55) continue;
    // Must look like prose: ≥40 chars OR contains professional language
    if (t.length >= 40 || POSITIONING_RE.test(t)) {
      posLines.push(t);
    }
  }
  return posLines;
}
const RESULT_SIGNAL_PATTERN = /\b(\d+[%xX]?|\$\d+|\d+\+|revenue|pipeline|conversion|activation|retention|engagement|cost|time|efficiency|growth|reduced|increased|improved|saved|launched|cut|lifted|grew|expanded)\b/i;
const CURRENT_TENSE_HINTS = /\b(lead|manage|build|own|drive|partner|develop|improve|coordinate|support)\b/i;
const PAST_TENSE_HINTS = /\b(led|managed|built|owned|drove|partnered|developed|improved|coordinated|supported|launched|delivered|implemented)\b/i;
const WEAK_BULLET_PATTERNS = [
  /^(helped|helped with)\b/i,
  /^(worked on)\b/i,
  /^(responsible for)\b/i,
  /^(assisted|assisted with)\b/i,
  /^(supported)\b/i,
  /^(tasked with)\b/i
];

const SECTION_ALIASES = {
  summary: ["summary", "professional summary", "profile", "about"],
  experience: ["experience", "work experience", "employment", "experience highlights"],
  education: ["education"],
  skills: ["skills", "technical skills", "core competencies", "core skills"],
  projects: ["projects", "projects hobbies", "projects interests"],
  certifications: ["certifications"],
  awards: ["awards"],
  volunteer: ["volunteer"],
  hobbies: ["hobbies", "hobbies interests"],
  interests: ["interests"],
  languages: ["languages"],
  publications: ["publications"],
  research: ["research"],
  coursework: ["coursework", "relevant coursework"],
  licenses: ["licenses", "licensure"],
  community: ["community", "community involvement"],
  extracurriculars: ["extracurriculars", "activities"],
  military: ["military service"],
  development: ["professional development", "training"],
  portfolio: ["portfolio"]
};

function normalizeWhitespace(text = "") {
  return text.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function splitLines(text = "") {
  return normalizeWhitespace(text).split("\n").map((line) => line.trim()).filter(Boolean);
}

function normalizeHeadingValue(line = "") {
  return String(line || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function isHeading(line) {
  const value = normalizeHeadingValue(line);
  return SECTION_HEADERS.includes(value) || Boolean(resolveCanonicalHeading(value));
}

function canonicalHeading(line) {
  const value = normalizeHeadingValue(line);
  const resolved = resolveCanonicalHeading(value);
  if (resolved) return resolved;
  return value;
}

function resolveCanonicalHeading(value) {
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(value)) {
      return canonical;
    }
  }
  return "";
}

function parseSections(text = "") {
  // Split preserving blank lines so experience entry boundaries survive intact.
  // normalizeWhitespace() has already been applied upstream — just split on \n.
  const lines = String(text)
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .map(l => l.trim());

  const sections = {};
  let current = "header";
  sections[current] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Only treat non-blank lines as potential headings
    if (line && isHeading(line)) {
      current = canonicalHeading(line);
      if (!sections[current]) {
        sections[current] = [];
      }
      continue;
    }
    sections[current].push(line); // blank strings preserved — they are entry separators
  }

  // Trim leading/trailing blank entries from each section's array
  for (const key of Object.keys(sections)) {
    if (!Array.isArray(sections[key])) continue;
    const arr = sections[key];
    let start = 0, end = arr.length;
    while (start < end && arr[start] === "") start++;
    while (end > start && arr[end - 1] === "") end--;
    sections[key] = arr.slice(start, end);
  }

  // ── Post-process: detect unlabeled positioning statement in header ──
  // If no labeled summary was found, check if a professional positioning
  // statement is buried inside the header block and promote it.
  const hasLabeledSummary = (sections.summary || []).filter(Boolean).length > 0;
  if (!hasLabeledSummary) {
    const unlabeled = extractUnlabeledSummaryFromHeader(sections.header || []);
    if (unlabeled.length) {
      sections.summary        = unlabeled;
      sections._summarySource = "unlabeled";
      // Remove from header to prevent duplication in the final output
      const unlabeledSet = new Set(unlabeled);
      sections.header = (sections.header || []).filter(l => !unlabeledSet.has(l.trim()));
    } else {
      sections._summarySource = "none";
    }
  } else {
    sections._summarySource = "labeled";
  }

  return sections;
}

function extractBullets(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]/.test(line))
    .map((line) => line.replace(/^[-*•]\s*/, "").trim());
}

function isWeakBullet(bullet = "") {
  const cleaned = bullet.trim();
  return WEAK_BULLET_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function hasResultSignal(bullet = "") {
  return RESULT_SIGNAL_PATTERN.test(bullet);
}

function normalizeWeakOpener(bullet = "") {
  const cleaned = bullet.trim();

  // "worked on improving X" / "helped with building Y" → convert gerund to past tense
  // Pattern: weak opener + gerund + rest
  const gerundMatch = cleaned.match(
    /^(?:worked on|helped (?:with )?|assisted (?:with )?|tasked with)\s+(\w+ing)\b(.*)/i
  );
  if (gerundMatch) {
    const gerund = gerundMatch[1].toLowerCase();
    const rest   = gerundMatch[2];
    const past   = GERUND_TO_PAST[gerund];
    if (past) return `${past}${rest}`;
  }

  // Simple weak opener replacements (no gerund follows)
  const replacements = [
    [/^(helped with|helped)\s+/i,         "Supported "],
    [/^(worked on)\s+/i,                  "Owned "],
    [/^(responsible for)\s+/i,            "Owned "],
    [/^(assisted with|assisted)\s+/i,     "Coordinated "],
    [/^(supported)\s+/i,                  "Supported "],
    [/^(tasked with)\s+/i,                "Owned "],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(cleaned)) {
      return cleaned.replace(pattern, replacement);
    }
  }

  return cleaned;
}

function extractCandidateSkills(text = "") {
  return normalizeSkillLines(text).accepted.slice(0, 20);
}

// ── Experience title/domain inference ──────────────────────────────

const TITLE_WORDS_RE = /\b(senior|lead|principal|staff|director|manager|engineer|developer|designer|analyst|scientist|strategist|specialist|coordinator|vp|vice president|associate|junior|head of|chief|architect|consultant|advisor|executive|officer|president|founder|co-founder|owner|partner)\b/i;

const DOMAIN_SIGNALS = [
  { domain: "software engineering",  re: /\b(software engineer|backend|frontend|full[- ]?stack|devops|sre|platform engineer|infrastructure|cloud engineer|mobile engineer|ios|android)\b/i },
  { domain: "product management",    re: /\b(product manager|product management|product lead|product owner|program manager|associate pm|apm)\b/i },
  { domain: "data science",          re: /\b(data scien|machine learning|ml engineer|deep learning|nlp|model training|data modeling|ai engineer)\b/i },
  { domain: "data analytics",        re: /\b(data analyst|business analyst|business intelligence|bi analyst|reporting analyst|analytics engineer)\b/i },
  { domain: "design",                re: /\b(ux designer|ui designer|product designer|visual designer|interaction designer|design lead|ux researcher)\b/i },
  { domain: "marketing",             re: /\b(marketing manager|growth marketing|content marketing|demand gen|brand manager|digital marketing|seo|sem|email marketing)\b/i },
  { domain: "sales",                 re: /\b(account executive|sales manager|business development|enterprise sales|sales lead|solutions engineer|customer success)\b/i },
  { domain: "finance",               re: /\b(financial analyst|finance manager|fp&a|investment analyst|controller|treasury|portfolio manager)\b/i },
  { domain: "operations",            re: /\b(operations manager|supply chain|logistics|process improvement|project manager|program manager|chief of staff)\b/i },
  { domain: "engineering",           re: /\bengineer(ing)?\b/i },
];

/**
 * Estimate total years of professional experience from date spans found in the resume.
 */
function estimateYearsExperience(sections) {
  const allText = Object.values(sections).filter(Array.isArray).flat().join(" ");
  const yearMatches = [...allText.matchAll(/\b((19|20)\d{2})\b/g)];
  const years = yearMatches
    .map(m => parseInt(m[1], 10))
    .filter(y => y >= 1990 && y <= new Date().getFullYear() + 1);

  if (years.length < 2) return 0;

  const hasPresent = /\b(present|current|now)\b/i.test(allText);
  const currentYear = new Date().getFullYear();
  const maxYear = hasPresent ? currentYear : Math.max(...years);
  const minYear = Math.min(...years);
  return Math.max(0, maxYear - minYear);
}

/**
 * Extract the most recent job title from the experience section.
 * Handles formats: "Title | Company", "Title, Company (Year)", "Title\nCompany\nDate"
 */
function extractMostRecentTitle(sections) {
  const expLines = (
    sections.experience ||
    sections["work experience"] ||
    sections.employment ||
    []
  ).filter(l => l.trim());

  for (const line of expLines.slice(0, 10)) {
    const t = line.trim();
    if (!t || /^[-*•]/.test(t)) continue;

    // "Title | Company" or "Title · Company"
    const beforePipe = t.split(/\s*[|·]\s*/)[0].trim();
    if (TITLE_WORDS_RE.test(beforePipe) && beforePipe.length < 60) {
      return beforePipe.replace(/,?\s*(19|20)\d{2}.*$/, "").trim();
    }

    // "Title, Company (Year)" or "Title at Company"
    const beforeComma = t.split(/,/)[0].trim();
    if (
      TITLE_WORDS_RE.test(beforeComma) &&
      beforeComma.length < 60 &&
      !/\b(19|20)\d{2}\b/.test(beforeComma)
    ) {
      return beforeComma;
    }

    // Short line with title words, no date
    if (
      TITLE_WORDS_RE.test(t) &&
      t.length < 60 &&
      !/\b(19|20)\d{2}\b/.test(t)
    ) {
      return t;
    }
  }
  return "";
}

/**
 * Infer professional domain from resume content and target role blurb.
 */
function inferDomain(sections, targetRole = "") {
  const allText = [
    ...Object.values(sections).filter(Array.isArray).flat(),
    targetRole
  ].join(" ");

  for (const { domain, re } of DOMAIN_SIGNALS) {
    if (re.test(allText)) return domain;
  }
  return "";
}

function topMissingKeywords(linkedinText = "", resumeText = "") {
  const linkedInTokens = extractCandidateSkills(linkedinText);
  const resumeLower = resumeText.toLowerCase();
  return linkedInTokens.filter((token) => !resumeLower.includes(token.toLowerCase())).slice(0, 8);
}

/**
 * Strip trailing noise from an extracted role title.
 * "Senior Product Manager roles at tech companies" → "Senior Product Manager"
 */
function cleanRoleTitle(title = "") {
  // Strip "roles/positions/jobs/opportunities" and anything after
  let s = title.trim();
  s = s.replace(/\s+(?:roles?|positions?|jobs?|opportunities?)\b.*$/i, "");
  // Strip trailing prepositions and anything after: "at X", "in Y", "for Z"
  s = s.replace(/\s+(?:at|in|for|with|and|or)\b.*$/i, "");
  return s.trim();
}

/**
 * Extract a clean job title from a freeform targeting blurb.
 * Avoids echoing the full blurb into the resume.
 *
 * "I'm applying to Senior Product Manager roles at tech companies" → "Senior Product Manager"
 * "Software Engineer" → "Software Engineer"
 */
function extractTargetRoleTitle(targetRole = "") {
  const text = String(targetRole || "").trim();
  if (!text) return "";

  // Already short and title-like — no first-person, no sentence punctuation
  if (
    text.length <= 50
    && !/[.!?]/.test(text)
    && !/^(i |i'm |i am |my |looking|want|applying|hope|seeking)/i.test(text)
  ) {
    return cleanRoleTitle(text);
  }

  // Ordered extraction patterns, most specific first
  const patterns = [
    // "applying to Senior Product Manager roles"
    /apply(?:ing)?\s+(?:for\s+|to\s+)(?:a\s+|an\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})/i,
    // "targeting a Senior PM role"
    /target(?:ing)?\s+(?:a\s+|an\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\s+(?:role|position|job)/i,
    // "seeking a Software Engineer position"
    /seek(?:ing)?\s+(?:a\s+|an\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\s+(?:role|position|job)/i,
    // "I am a Product Manager"
    /(?:i'm|i am)\s+a(?:n\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\b/i,
    // "currently working as a Data Scientist"
    /(?:working\s+as|currently\s+(?:a|an))\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\b/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanRoleTitle(m[1].trim());
      if (candidate.length >= 3 && candidate.length <= 50) {
        return candidate;
      }
    }
  }

  return "";
}

function inferProfessionalLabel(linkedinText = "", targetRole = "") {
  const firstLine = splitLines(linkedinText)[0] || "";
  const beforeWith = firstLine.split(/\bwith\b/i)[0].trim();
  if (beforeWith && beforeWith.length <= 40) {
    return beforeWith.replace(/[.]+$/, "");
  }

  // Use only the extracted clean title, never the raw blurb
  const title = extractTargetRoleTitle(targetRole);
  if (title) return title;

  return "Professional";
}

/**
 * Build a role-aware professional summary from actual resume content.
 * Uses most recent title, years of experience, domain, and target context.
 * Never echoes the raw targeting blurb verbatim.
 */
function summarizeProfile({ sections = {}, linkedinText = "", skillText = "", targetRole = "" }) {
  const targetTitle = extractTargetRoleTitle(targetRole);
  const recentTitle = extractMostRecentTitle(sections);
  const yearsExp    = estimateYearsExperience(sections);
  const domain      = inferDomain(sections, targetRole);
  const skills      = extractCandidateSkills(`${linkedinText}\n${skillText}`).slice(0, 3);

  // ── Primary label: most recent title → LinkedIn → target title → empty ──
  let label = recentTitle;
  if (!label) {
    const firstLinkedInLine = splitLines(linkedinText)[0] || "";
    const liLabel = firstLinkedInLine.split(/\bwith\b/i)[0].trim().replace(/[.]+$/, "");
    if (liLabel && liLabel.length <= 40 && !STOPWORDS.has(liLabel.toLowerCase())) {
      label = liLabel;
    }
  }
  if (!label) label = targetTitle || "";
  // If we have no credible label, return empty — caller should skip or prompt user
  if (!label) return "";

  // ── Experience span ──
  let expPhrase = "";
  if (yearsExp >= 1) {
    const rounded = yearsExp >= 10 ? `${Math.floor(yearsExp / 5) * 5}+` : `${yearsExp}+`;
    expPhrase = ` with ${rounded} years of experience`;
    if (domain) expPhrase += ` in ${domain}`;
  } else if (domain) {
    expPhrase = ` with a background in ${domain}`;
  }

  // ── Skills context ──
  let skillPhrase = "";
  if (skills.length >= 2) {
    skillPhrase = `. Core strengths include ${skills.slice(0, 3).join(", ")}`;
  } else if (skills.length === 1) {
    skillPhrase = `. Core expertise in ${skills[0]}`;
  }

  // ── Target direction (only if meaningfully different from current label) ──
  let targetPhrase = "";
  if (
    targetTitle &&
    targetTitle.toLowerCase() !== label.toLowerCase() &&
    !label.toLowerCase().includes(targetTitle.toLowerCase().split(" ")[0].toLowerCase())
  ) {
    targetPhrase = `. Targeting ${targetTitle} opportunities`;
  }

  return `${label}${expPhrase}${skillPhrase}${targetPhrase}.`.replace(/\.{2,}/g, ".");
}

function sectionsFromText(text = "") {
  return parseSections(normalizeWhitespace(text));
}

/**
 * Returns true if the first word of `text` is recognisably a verb:
 *   • regular past tense (-ed / -ied)
 *   • known irregular past tense (led, built, ran, …)
 *   • known infinitive resume verb (architect, enable, introduce, …)
 *   • present-participle (-ing) that can open a bullet
 * Never prepend another verb when this returns true.
 */
function firstWordIsVerb(text) {
  const firstWord = (text.match(/^([A-Za-z]+)/) || [])[1] || "";
  const lower = firstWord.toLowerCase();
  if (!lower) return false;
  if (lower.length > 4 && /(?:ed|ied)$/.test(lower)) return true;   // regular past
  if (IRREGULAR_PAST_VERBS.has(lower)) return true;
  if (INFINITIVE_TO_PAST[lower]) return true;                         // known infinitive
  if (lower.length > 5 && /ing$/.test(lower)) return true;           // -ing form
  return false;
}

function strengthenBullet(bullet, _index) {
  const normalized = normalizeWeakOpener(bullet.replace(/\s+/g, " ").trim());
  if (!normalized) return null;

  const firstWord = (normalized.match(/^([A-Za-z]+)/) || [])[1] || "";
  const lower = firstWord.toLowerCase();

  // Known infinitive verb → convert to past tense
  if (INFINITIVE_TO_PAST[lower]) {
    const past = INFINITIVE_TO_PAST[lower];
    // Replace exactly the first word (case-insensitive) with the past-tense form
    return past + normalized.slice(firstWord.length);
  }

  // Already a verb (past, irregular, -ing) → preserve as-is, just capitalise
  if (firstWordIsVerb(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  // No recognisable verb — capitalise and return without forcing a prefix
  // (forcing a random verb here is what causes "Led Architect…" doubled-verb bugs)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function scoreBullet(bullet = "") {
  const cleaned = bullet.replace(/^[-*•]\s*/, "").trim();
  if (!cleaned) {
    return {
      score: 0,
      issues: ["empty bullet"]
    };
  }

  const issues = [];
  let score = 0;

  if (WEAK_STARTER_PATTERN.test(cleaned)) {
    issues.push("starts with weak filler phrasing");
  } else if (firstWordIsVerb(cleaned)) {
    score += 3;
  } else {
    issues.push("does not start with a strong action verb");
  }

  if (/\b(with|across|through|by|for|via|alongside|partnering with|working with)\b/i.test(cleaned) || cleaned.split(/\s+/).length >= 8) {
    score += 2;
  } else {
    issues.push("missing clear scope or execution detail");
  }

  if (hasResultSignal(cleaned)) {
    score += 3;
  } else {
    issues.push("missing a visible result or outcome");
  }

  if (/\bI\b|\bmy\b|\bme\b/.test(cleaned)) {
    issues.push("uses first-person language");
  }

  if (cleaned.length > 180) {
    issues.push("too long for easy scanning");
  } else if (cleaned.length >= 70) {
    score += 1;
  }

  return {
    score: Math.max(0, Math.min(score, 9)),
    issues
  };
}

function detectTenseIssues(bullets = []) {
  if (bullets.length < 2) {
    return [];
  }

  const currentTense = bullets.filter((bullet) => CURRENT_TENSE_HINTS.test(bullet)).length;
  const pastTense = bullets.filter((bullet) => PAST_TENSE_HINTS.test(bullet)).length;
  if (currentTense && pastTense) {
    return ["mixed verb tense across bullets"];
  }
  return [];
}

function lintBullets(bullets = []) {
  const scoredBullets = bullets.map((bullet) => ({
    bullet,
    ...scoreBullet(bullet)
  }));
  const failingBullets = scoredBullets.filter((item) => item.score < 5);
  const tenseIssues = detectTenseIssues(bullets);

  return {
    scoredBullets,
    averageScore: scoredBullets.length
      ? scoredBullets.reduce((sum, item) => sum + item.score, 0) / scoredBullets.length
      : 0,
    failingBullets,
    tenseIssues
  };
}

/**
 * Reassemble structured entries into display text, strengthening bullets
 * and tracking changes. Returns { lines, changes }.
 */
function formatEntriesWithAnnotations(entries = []) {
  const allLines   = [];
  const allChanges = [];
  let bulletIndex  = 0;

  for (const entry of entries) {
    // Role header — preserved verbatim
    allLines.push(...entry.headerLines.filter(Boolean));
    if (entry.dateRange) allLines.push(entry.dateRange);

    // Bullets — strengthen and record changes
    for (const original of entry.bullets) {
      const revised = strengthenBullet(original, bulletIndex++);
      allLines.push(`- ${revised || original}`);

      if (revised && revised.toLowerCase() !== original.toLowerCase()) {
        const reasons = [];
        if (WEAK_STARTER_PATTERN.test(original))   reasons.push("weak filler phrase replaced with action verb");
        else if (/^[a-z]/i.test(original) && INFINITIVE_TO_PAST[(original.match(/^([A-Za-z]+)/) || [])[1]?.toLowerCase() || ""])
          reasons.push("verb converted from present to past tense");
        if (!hasResultSignal(original)) reasons.push("consider adding a quantified result or outcome");
        if (/\bI\b|\bmy\b|\bme\b/.test(original))  reasons.push("first-person language removed");
        if (reasons.length) allChanges.push({ original, revised, reason: reasons.join("; ") });
      }
    }

    allLines.push(""); // blank line between entries
  }

  // Remove trailing blank
  while (allLines.length && allLines[allLines.length - 1] === "") allLines.pop();

  return { lines: allLines, changes: allChanges };
}

function formatExperienceLines(lines = []) {
  return formatExperienceWithAnnotations(lines).lines;
}

/**
 * Strengthen experience bullets and return both the improved lines AND
 * a change-log explaining what was changed and why — for per-bullet trust signals.
 *
 * Returns { lines: string[], changes: Array<{original, revised, reason}> }
 */
function formatExperienceWithAnnotations(lines = []) {
  const resultLines = [];
  const changes = [];
  let bulletIndex = 0;

  for (const line of lines) {
    const t = line.trim();

    // Preserve blank lines as entry separators — never discard structure
    if (!t) {
      resultLines.push("");
      continue;
    }

    if (/^[-*•]/.test(t)) {
      const original = t.replace(/^[-*•]\s*/, "").trim();
      const revised  = strengthenBullet(original, bulletIndex);
      bulletIndex++;

      if (!revised) {
        resultLines.push(`- ${original}`);
        continue;
      }

      resultLines.push(`- ${revised}`);

      // Record change only when something actually changed
      if (revised.toLowerCase() !== original.toLowerCase()) {
        const reasons = [];
        const firstWordLower = (original.match(/^([A-Za-z]+)/) || [])[1]?.toLowerCase() || "";
        if (WEAK_STARTER_PATTERN.test(original)) {
          reasons.push("weak filler phrase replaced with action verb");
        } else if (INFINITIVE_TO_PAST[firstWordLower]) {
          reasons.push("verb converted from present to past tense");
        }
        if (!hasResultSignal(original)) {
          reasons.push("consider adding a quantified result or outcome");
        }
        if (/\bI\b|\bmy\b|\bme\b/.test(original)) {
          reasons.push("first-person language removed");
        }
        if (reasons.length) {
          changes.push({
            original,
            revised,
            reason: reasons.join("; ")
          });
        }
      }
      continue;
    }

    // Non-bullet lines (company, title, date) — preserve as-is
    resultLines.push(t);
  }

  return { lines: resultLines, changes };
}

function buildSuggestions({ sections, bullets, resumeText, linkedinText, targetRole }) {
  const suggestions = [];
  const summaryLines = sections.summary || sections["professional summary"] || sections.profile || [];
  const skillLines = sections.skills || sections["technical skills"] || sections["core competencies"] || [];
  const experienceLines = sections.experience || sections["work experience"] || sections.employment || [];
  const metricsCount = (resumeText.match(/\b\d+[%xX]?|\$\d/g) || []).length;
  const missingKeywords = topMissingKeywords(linkedinText, resumeText);
  const weakBullets = bullets.filter((bullet) => isWeakBullet(bullet));
  const lowSignalBullets = bullets.filter((bullet) => !hasResultSignal(bullet));
  const bulletLint = lintBullets(bullets);

  if (!summaryLines.filter(Boolean).length) {
    suggestions.push({
      priority: "high",
      title: "Add a professional summary",
      detail: `Your resume should open with a 2-3 line summary tailored to ${targetRole || "the role you want"}.`
    });
  }

  if (!skillLines.filter(Boolean).length) {
    suggestions.push({
      priority: "high",
      title: "Add a skills section",
      detail: "Create a dedicated skills section so recruiters and ATS scanners can match keywords quickly."
    });
  }

  if (experienceLines.filter(Boolean).length && !bullets.length) {
    suggestions.push({
      priority: "high",
      title: "Convert experience paragraphs into bullets",
      detail: "Short, impact-focused bullets are easier to scan than dense paragraphs."
    });
  }

  if (bullets.length && metricsCount < Math.max(2, Math.floor(bullets.length / 3))) {
    suggestions.push({
      priority: "high",
      title: "Add more quantified outcomes",
      detail: "Most of your bullets describe work, but not enough of them show measurable impact."
    });
  }

  if (weakBullets.length) {
    suggestions.push({
      priority: "high",
      title: "Replace weak bullet openers",
      detail: `${weakBullets.length} bullet(s) still open with vague phrasing like “helped with” or “worked on.” Rewrite them to show ownership, action, and what changed.`
    });
  }

  if (bulletLint.failingBullets.length >= 1) {
    suggestions.push({
      priority: "high",
      title: "Rewrite vague bullets into action and result bullets",
      detail: `${bulletLint.failingBullets.length} bullet(s) still miss one of the essentials: a strong verb, clear scope, or a visible result. Rewrite them to show what you owned, how you executed it, and what changed.`
    });
  }

  if (lowSignalBullets.length >= Math.max(2, Math.ceil(bullets.length / 2))) {
    suggestions.push({
      priority: "medium",
      title: "Close more bullets with impact",
      detail: "Several bullets explain the work but not the result. Add the business effect, user outcome, or measurable shift where you can."
    });
  }

  const longBullets = bullets.filter((bullet) => bullet.length > 160);
  if (longBullets.length) {
    suggestions.push({
      priority: "medium",
      title: "Tighten long bullets",
      detail: `${longBullets.length} bullet(s) are likely too long. Aim for one result per bullet.`
    });
  }

  if (/\bI\b|\bmy\b|\bme\b/.test(resumeText)) {
    suggestions.push({
      priority: "medium",
      title: "Remove first-person language",
      detail: "Resume bullets should usually omit first-person pronouns."
    });
  }

  if (!/\b(20\d{2}|19\d{2})\b/.test(resumeText)) {
    suggestions.push({
      priority: "medium",
      title: "Add dates to your experience",
      detail: "Recruiters will expect clear timelines for roles, projects, and education."
    });
  }

  if (missingKeywords.length) {
    suggestions.push({
      priority: "medium",
      title: "Pull more signal from your LinkedIn profile",
      detail: `These LinkedIn terms do not show up in the resume: ${missingKeywords.join(", ")}.`
    });
  }

  if (bulletLint.tenseIssues.length) {
    suggestions.push({
      priority: "medium",
      title: "Make verb tense consistent",
      detail: "Use present tense for your current role and past tense for past roles so your experience reads cleanly and credibly."
    });
  }

  return suggestions;
}

function buildSectionSuggestions({ sections, bullets, linkedinText, targetRole }) {
  const summaryLines = sections.summary || sections["professional summary"] || sections.profile || [];
  const skillSectionText = [
    ...(sections.skills || []),
    ...(sections["technical skills"] || []),
    ...(sections["core competencies"] || [])
  ].join("\n");
  const experienceLines = sections.experience || sections["work experience"] || sections.employment || [];
  const educationLines = sections.education || [];
  const normalizedSkills = normalizeSkillLines(skillSectionText);
  const bulletLint = lintBullets(bullets);

  const summaryIssues = (() => {
    const existing = summaryLines.filter(Boolean);
    if (!existing.length) {
      return [{
        sectionId: "summary",
        title: "Add a short summary",
        detail: `Write 2-3 lines that position you toward ${targetRole || "the role you want"} without repeating your full work history.`
      }];
    }
    const text = existing.join(" ");
    const issues = [];
    if (text.length < 60) {
      issues.push({
        sectionId: "summary",
        title: "Expand your summary",
        detail: "A strong summary is 2–3 sentences covering your role, experience level, and what makes you stand out."
      });
    }
    if (/\bI\b|\bmy\b|\bme\b/i.test(text)) {
      issues.push({
        sectionId: "summary",
        title: "Remove first-person language",
        detail: "Write in third-person style — omit 'I', 'my', 'me'. Most hiring managers expect this format."
      });
    }
    if (/\b(hard.?working|team player|self.?starter|detail.?oriented|results.?driven|go.?getter|motivated individual|passionate about)\b/i.test(text)) {
      issues.push({
        sectionId: "summary",
        title: "Replace generic traits with specific value",
        detail: "Phrases like 'team player' or 'results-driven' add no signal. Replace with a concrete scope, skill, or outcome."
      });
    }
    return issues;
  })();

  return {
    header: [],
    summary: summaryIssues,
    experience: [
      ...(!experienceLines.filter(Boolean).length
        ? [{
            sectionId: "experience",
            title: "Add experience entries",
            detail: "Experience should show role, company, dates, and the strongest impact bullets."
          }]
        : []),
      ...(bulletLint.failingBullets.length
        ? [{
            sectionId: "experience",
            title: "Tighten weak bullets",
            detail: "Experience bullets should show ownership, scope, and outcome instead of vague task wording."
          }]
        : []),
      ...(!/\b(19|20)\d{2}\b/.test(experienceLines.join("\n"))
        ? [{
            sectionId: "experience",
            title: "Add dates to experience",
            detail: "Use clear years or date ranges for each role so recruiters can follow the timeline."
          }]
        : [])
    ],
    skills: [
      ...(normalizedSkills.rejected.length
        ? [{
            sectionId: "skills",
            title: "Replace vague skills",
            detail: "Use recognizable recruiter-facing skills, tools, and methods instead of traits or resume prose."
          }]
        : []),
      ...(normalizedSkills.accepted.length < 3
        ? [{
            sectionId: "skills",
            title: "Ground skills in the target role",
            detail: `Add standardized skills that a ${targetRole || "hiring manager"} would expect to scan quickly.`
          }]
        : [])
    ],
    education: [
      ...(educationLines.filter(Boolean).length && !/\b(19|20)\d{2}\b/.test(educationLines.join("\n"))
        ? [{
            sectionId: "education",
            title: "Add a year or date",
            detail: "Education reads more credibly when the entry includes a year or date range."
          }]
        : []),
      ...(!educationLines.filter(Boolean).length
        ? [{
            sectionId: "education",
            title: "Only add education if it helps",
            detail: "Include school, degree, and year only when the section adds signal for this resume."
          }]
        : [])
    ]
  };
}

function buildDraft({ sections, bullets, linkedinText, resumeText, targetRole }) {
  const header = (sections.header || []).filter(l => l.trim()).slice(0, 4);
  const skillSectionText = [
    ...(sections.skills || []),
    ...(sections["technical skills"] || []),
    ...(sections["core competencies"] || [])
  ].join("\n");

  // ── Summary: preserve existing content; only generate if truly absent ──
  // Using summarizeProfile() when an existing summary is present would silently
  // replace what the candidate wrote with a heuristic one-liner.
  const existingSummaryLines = (sections.summary || []).filter(l => l.trim());
  const summary = existingSummaryLines.length
    ? existingSummaryLines.join(" ").trim()
    : summarizeProfile({ sections, linkedinText, skillText: skillSectionText, targetRole });

  const skills = [...new Set([
    ...extractCandidateSkills(linkedinText),
    ...extractCandidateSkills(skillSectionText)
  ])].slice(0, 12);

  // Parse experience as structured entries, then format each entry faithfully
  const rawExpLines =
    (sections.experience || sections["work experience"] || []).filter(Boolean).length
      ? (sections.experience || sections["work experience"] || [])
      : splitLines(resumeText).filter(line => /^[-*•]/.test(line));

  const expEntries = parseExperienceEntries(rawExpLines);
  const { lines: experienceLines } = expEntries.length
    ? formatEntriesWithAnnotations(expEntries)
    : formatExperienceWithAnnotations(rawExpLines); // fallback for edge cases

  const education = (sections.education || []).filter(l => l.trim());
  const projects  = (sections.projects  || []).filter(l => l.trim());

  // ── Final dedup: remove any header lines that duplicate the summary ──
  // parseSections() should have already done this for unlabeled summaries,
  // but guard against edge cases (e.g. copy-pasted resumes with repeated text).
  let dedupedHeader = header;
  if (summary && header.length) {
    const summaryWords = new Set((summary.toLowerCase().match(/\b\w{5,}\b/g) || []));
    dedupedHeader = header.filter(h => {
      const hWords = (h.toLowerCase().match(/\b\w{5,}\b/g) || []);
      if (hWords.length < 3) return true; // short name/location lines — always keep
      const overlap = hWords.filter(w => summaryWords.has(w)).length;
      return overlap / hWords.length < 0.5; // keep if <50% word overlap with summary
    });
  }

  const output = [];
  if (dedupedHeader.length) {
    output.push(...dedupedHeader, "");
  }
  if (summary) {
    output.push("SUMMARY");
    output.push(summary, "");
  }

  if (skills.length) {
    output.push("SKILLS");
    output.push(skills.join(" | "), "");
  }

  if (experienceLines.filter(l => l.trim()).length) {
    output.push("EXPERIENCE");
    for (const line of experienceLines) {
      output.push(line);
    }
    output.push("");
  }

  if (projects.length) {
    output.push("PROJECTS");
    for (const line of projects.slice(0, 8)) {
      output.push(`- ${line.replace(/^[-*•]\s*/, "")}`);
    }
    output.push("");
  }

  if (education.length) {
    output.push("EDUCATION");
    output.push(...education.slice(0, 6), "");
  }

  return output.join("\n").trim();
}

// ── New helpers added below ────────────────────────────────────────

const SECTION_DISPLAY_LABELS = {
  heading:        "Contact Info",
  summary:        "Professional Summary",
  experience:     "Experience",
  skills:         "Skills",
  education:      "Education",
  projects:       "Projects",
  certifications: "Certifications",
  awards:         "Awards",
  volunteer:      "Volunteer & Leadership",
  hobbies:        "Hobbies",
  interests:      "Interests",
  languages:      "Languages",
  publications:   "Publications",
  research:       "Research",
  coursework:     "Coursework",
  licenses:       "Licenses",
  community:      "Community Involvement",
  extracurriculars: "Extracurriculars",
  military:       "Military Service",
  development:    "Professional Development",
  portfolio:      "Portfolio",
};

// Common non-name words that can appear in resume headers
const NON_NAME_WORDS = new Set([
  "home", "jobs", "messaging", "notifications", "premium", "linkedin",
  "search", "me", "work", "learning", "resume", "curriculum", "vitae", "cv"
]);

/**
 * Extract candidate name from the resume header section.
 * Looks for the first line that resembles a full name.
 */
function extractCandidateName(sections) {
  const headerLines = (sections.header || []).filter(l => l.trim());
  for (const line of headerLines.slice(0, 5)) {
    const t = line.trim();
    // Skip contact info lines
    if (/@/.test(t)) continue;
    if (/^https?:|^www\./i.test(t)) continue;
    if (/linkedin\.com/i.test(t)) continue;
    if (/\d{3}[-.\s]\d{3,4}/.test(t)) continue; // phone
    if (t.split(/[|·,]/).length > 2) continue;   // multiple fields on one line
    // Skip lines where any word is a known platform/nav term
    const words = t.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.some(w => NON_NAME_WORDS.has(w))) continue;
    // Looks like a name: 2-4 capitalized words, reasonable length
    if (/^[A-Z][a-z'-]+(\s+[A-Z][a-z'-]+){1,3}$/.test(t) && t.length < 60) {
      return t;
    }
    // Relaxed fallback: first line with no digits, not too long — likely the name
    if (headerLines.indexOf(line) === 0 && t.length < 60 && !/\d/.test(t) && words.length <= 4) {
      return t.split(/[|·,–—]/, 1)[0].trim();
    }
  }
  return "";
}

/**
 * Infer candidate career level from resume content signals.
 */
function inferCandidateLevel(sections, bullets, targetRole = "") {
  const allText = Object.values(sections).filter(Array.isArray).flat().join(" ");
  const expLines = (sections.experience || sections["work experience"] || []).join("\n");

  const isStudent  = /\b(student|pursuing|expected graduation|class of 20\d{2}|gpa:?)\b/i.test(allText);
  const hasExp     = expLines.trim().length > 50;

  if (isStudent && !hasExp) return "student";

  // Estimate year span from experience dates
  const yearMatches = [...expLines.matchAll(/\b(19|20)(\d{2})\b/g)];
  const years = yearMatches.map(m => parseInt(m[0], 10)).filter(y => y >= 1990 && y <= 2035);
  const span  = years.length >= 2 ? Math.max(...years) - Math.min(...years) : 0;

  if (/career (switch|change|pivot)|transiti(?:on|oning)/i.test(targetRole + " " + allText)) return "career-switcher";
  if (span === 0 && isStudent) return "new-grad";
  if (span <= 2)  return "early-career";
  if (span >= 12) return "senior";
  return "experienced";
}

/**
 * Determine the section order for the guided editor based on candidate level.
 */
function determineSectionOrder(sections, candidateLevel) {
  const base = ["heading", "summary", "experience", "skills", "education"];

  // For students/new-grads, projects are more relevant than for experienced candidates
  const hasProjects = (sections.projects || []).filter(l => l.trim()).length > 0;
  if (hasProjects && (candidateLevel === "student" || candidateLevel === "new-grad" || candidateLevel === "career-switcher")) {
    base.splice(base.indexOf("education"), 0, "projects");
  }

  // Append optional sections only if they have content
  for (const id of [
    "projects",
    "certifications",
    "licenses",
    "publications",
    "research",
    "coursework",
    "portfolio",
    "awards",
    "volunteer",
    "community",
    "extracurriculars",
    "military",
    "development",
    "hobbies",
    "interests",
    "languages"
  ]) {
    if (!base.includes(id) && (sections[id] || []).filter(l => l.trim()).length > 0) {
      base.push(id);
    }
  }

  return base;
}

/**
 * Build a one-sentence critique for a section to show in the editor.
 */
function buildSectionCritique(sectionId, suggestions, status) {
  if (status === "ok") {
    const okMessages = {
      heading:    "Contact info looks complete.",
      summary:    "Summary looks solid.",
      experience: "Experience section looks well-structured.",
      skills:     "Skills section looks good.",
      education:  "Education section looks clean.",
    };
    return okMessages[sectionId] || `${SECTION_DISPLAY_LABELS[sectionId] || sectionId} looks good.`;
  }

  if (status === "missing") {
    const missingMessages = {
      heading:        "No contact info detected. Add your name, email, phone, and LinkedIn.",
      summary:        "No summary detected. A 2–3 line positioning statement helps recruiters and ATS systems quickly understand your profile.",
      experience:     "No experience entries found. Add your work history with company, title, and dates.",
      skills:         "No skills section found. Add your key tools, technologies, and competencies.",
      education:      "No education found. Add your degree, school, and graduation year.",
      projects:       "No projects found. Consider adding relevant projects that demonstrate your skills.",
      certifications: "No certifications found.",
    };
    return missingMessages[sectionId] || `No ${(SECTION_DISPLAY_LABELS[sectionId] || sectionId).toLowerCase()} detected.`;
  }

  // Has suggestions — summarize the top issue(s)
  if (!suggestions.length) return "";
  if (suggestions.length === 1) return suggestions[0].detail || suggestions[0].title;
  return `${suggestions.length} improvements found: ${suggestions.slice(0, 2).map(s => s.title).join("; ")}.`;
}

/**
 * Build the per-section data that powers the guided section editor.
 * Returns an array of section objects in the recommended edit order.
 *
 * Each section includes:
 *   - currentText / proposedText (what we found vs. what we suggest)
 *   - critique (one-sentence overview of the issue)
 *   - status  (ok | needs-work | missing)
 *   - changeLog (array of {original, revised, reason} for experience bullets)
 *   - parseWarning (string | null) — surfaces low-confidence parsing
 */
function buildSectionEditorData({
  sections,
  rewrittenResume,
  sectionSuggestions,
  candidateLevel,
  targetRole,
  contactInfo,
  linkedinText
}) {
  const rewrittenSections = parseSections(normalizeWhitespace(rewrittenResume));

  // Parse experience into structured entries for confidence signals + changelog
  const rawExpLines = sections.experience || sections["work experience"] || [];
  const expEntries  = parseExperienceEntries(rawExpLines);
  const { changes: expChanges } = expEntries.length
    ? formatEntriesWithAnnotations(expEntries)
    : formatExperienceWithAnnotations(rawExpLines);

  const order = determineSectionOrder(sections, candidateLevel);

  return order.map(id => {
    const internalId = id === "heading" ? "header" : id;

    const currentLines  = (sections[internalId] || []).filter(l => l.trim());
    const proposedLines = (rewrittenSections[internalId] || []).filter(l => l.trim());
    const sectionIssues = sectionSuggestions[id] || sectionSuggestions[internalId] || [];

    const hasCurrentContent = currentLines.length > 0;

    const status = !hasCurrentContent
      ? "missing"
      : sectionIssues.length > 0
        ? "needs-work"
        : "ok";

    // Proposed text: for experience, preserve blank lines between entries.
    // proposedLines uses .filter(l => l.trim()) which strips blanks — bypass it for experience.
    let proposedText;
    if (id === "experience" && expEntries.length > 0) {
      // Use formatted entries directly so role boundaries are always visible
      const { lines: propLines } = formatEntriesWithAnnotations(expEntries);
      proposedText = propLines.join("\n").trim();
    } else {
      proposedText = proposedLines.join("\n").trim();
      if (!proposedText && hasCurrentContent) {
        proposedText = currentLines.join("\n").trim();
      }
    }

    // Parsing confidence warning — derived from structured entry parser or summary detection
    let parseWarning = null;

    if (id === "summary") {
      const src = sections._summarySource;
      if (src === "unlabeled") {
        parseWarning = "We detected a positioning statement near the top of your resume and treated it as your summary. Review and refine it below.";
      }
    }

    if (id === "experience" && hasCurrentContent) {
      const lowConfEntries = expEntries.filter(e => e.confidence === "low");
      const noDates        = expEntries.length > 0 && expEntries.every(e => !e.dateRange && !e.headerLines.some(l => /\b(19|20)\d{2}\b/.test(l)));
      const noBullets      = expEntries.length > 0 && expEntries.every(e => e.bullets.length === 0);
      const noEntries      = expEntries.length === 0 && currentLines.length > 0;

      if (noEntries || (expEntries.length === 1 && currentLines.length > 10)) {
        parseWarning = "We could not clearly separate individual roles. The changes below apply to the whole experience block. Please review each entry carefully before applying.";
      } else if (noDates) {
        parseWarning = "No date ranges detected. Add year ranges (e.g. 2020–2023) to each role so the timeline is clear.";
      } else if (noBullets) {
        parseWarning = "No bullet points found. Consider converting your experience descriptions into action bullets for easier scanning.";
      } else if (lowConfEntries.length > 0) {
        parseWarning = `${lowConfEntries.length} role${lowConfEntries.length > 1 ? "s" : ""} could not be parsed with high confidence. Review the suggested rewrite before applying.`;
      }
    }

    // For experience: reconstruct current text from structured entries so role
    // boundaries are clearly visible (blank lines between entries)
    let currentText = currentLines.join("\n").trim();
    if (id === "experience" && expEntries.length > 0) {
      currentText = expEntries.map(e => [
        formatExperienceEntryHeading(e, { alignDate: true }),
        ...e.bullets.map(b => `- ${b}`)
      ].filter(Boolean).join("\n")).join("\n\n");
    }

    const skillContext = [
      ...(sections.skills || []),
      ...(sections["technical skills"] || []),
      ...(sections["core competencies"] || []),
      linkedinText || ""
    ].join("\n");
    const sectionLevelSuggestions = (() => {
      if (id === "heading") {
        return buildContactSuggestions(contactInfo);
      }
      if (id === "summary") {
        return buildSummarySuggestions({
          currentText,
          targetRole,
          candidateLevel,
          skills: extractCandidateSkills(skillContext)
        });
      }
      if (id === "experience") {
        return buildExperienceSuggestions({ entries: expEntries });
      }
      if (id === "skills") {
        return buildSkillsSuggestions({
          currentText,
          targetRole,
          supportingText: linkedinText
        });
      }
      if (id === "education") {
        return buildEducationSuggestions({ currentText });
      }
      return [];
    })();
    const hasActionableSuggestion = sectionLevelSuggestions.some((item) => ["high", "medium"].includes(item.severity || "medium"));
    const effectiveStatus = status === "ok" && (hasActionableSuggestion || parseWarning) ? "needs-work" : status;

    const sectionResult = {
      id,
      label:      SECTION_DISPLAY_LABELS[id] || id,
      currentText,
      proposedText,
      critique:   buildSectionCritique(id, sectionIssues, effectiveStatus),
      status:     effectiveStatus,
      changeLog:  id === "experience" ? expChanges : [],
      suggestions: sectionLevelSuggestions,
      parsedFields: id === "heading" ? contactInfo : id === "experience" ? { entries: expEntries } : {},
      parseWarning,
    };

    if (id === "summary") {
      sectionResult.summarySource = sections._summarySource || "none";
    }

    return sectionResult;
  });
}

export function analyzeResume({ linkedinText = "", linkedinUrl = "", resumeText = "", targetRole = "" }) {
  const normalizedResume   = normalizeWhitespace(resumeText);
  const normalizedLinkedIn = normalizeWhitespace(linkedinText);
  const sections    = parseSections(normalizedResume);
  const bullets     = extractBullets(normalizedResume);
  const bulletLint  = lintBullets(bullets);
  const suggestions = buildSuggestions({
    sections,
    bullets,
    resumeText:   normalizedResume,
    linkedinText: normalizedLinkedIn,
    targetRole
  });
  const missingKeywords  = topMissingKeywords(normalizedLinkedIn, normalizedResume);
  const contactInfo      = extractContactInfo(sections.header || []);
  const candidateName    = contactInfo.name || extractCandidateName(sections);
  const candidateLevel   = inferCandidateLevel(sections, bullets, targetRole);
  const sectionSuggestions = buildSectionSuggestions({
    sections,
    bullets,
    linkedinText: normalizedLinkedIn,
    targetRole
  });
  const rewrittenResume = buildDraft({
    sections,
    bullets,
    linkedinText: normalizedLinkedIn,
    resumeText:   normalizedResume,
    targetRole
  });

  return {
    candidateName,
    contactInfo,
    candidateLevel,
    meta: {
      linkedinUrl:       linkedinUrl.trim(),
      targetRole:        targetRole.trim(),
      resumeCharacters:  normalizedResume.length,
      linkedinCharacters: normalizedLinkedIn.length
    },
    extracted: {
      sections:           Object.keys(sections).filter((key) => !key.startsWith("_")),
      bullets:            bullets.length,
      missingKeywords,
      bulletQualityScore: Number(bulletLint.averageScore.toFixed(1)),
      weakBulletCount:    bulletLint.failingBullets.length
    },
    lint:             bulletLint,
    suggestions,
    sectionSuggestions,
    sectionEditorData: buildSectionEditorData({
      sections,
      rewrittenResume,
      sectionSuggestions,
      candidateLevel,
      targetRole,
      contactInfo,
      linkedinText: normalizedLinkedIn
    }),
    rewrittenResume
  };
}
import { normalizeSkillLines } from "./skills-grounding.js";
