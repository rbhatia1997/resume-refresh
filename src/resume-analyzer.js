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
  "volunteer"
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

const ACTION_VERBS = [
  "Led", "Built", "Launched", "Improved", "Designed", "Delivered", "Scaled",
  "Automated", "Streamlined", "Reduced", "Increased", "Implemented", "Created",
  "Owned", "Drove", "Managed", "Developed", "Optimized", "Executed", "Coordinated"
];
const ACTION_VERB_PATTERN = /^(achieved|analyzed|automated|built|coached|coordinated|created|defined|delivered|designed|developed|drove|executed|expanded|generated|grew|implemented|improved|increased|launched|led|managed|negotiated|optimized|orchestrated|owned|partnered|reduced|researched|scaled|shipped|spearheaded|streamlined)\b/i;
const WEAK_STARTER_PATTERN = /^(helped|helped with|worked on|responsible for|assisted|assisted with|supported|tasked with)\b/i;
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
  projects: ["projects"],
  certifications: ["certifications"],
  awards: ["awards"],
  volunteer: ["volunteer"]
};

function normalizeWhitespace(text = "") {
  return text.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function splitLines(text = "") {
  return normalizeWhitespace(text).split("\n").map((line) => line.trim()).filter(Boolean);
}

function isHeading(line) {
  const value = line.toLowerCase().replace(/[^a-z ]/g, "").trim();
  return SECTION_HEADERS.includes(value);
}

function canonicalHeading(line) {
  const value = line.toLowerCase().replace(/[^a-z ]/g, "").trim();
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(value)) {
      return canonical;
    }
  }
  return value;
}

function parseSections(text = "") {
  const lines = splitLines(text);
  const sections = {};
  let current = "header";
  sections[current] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      current = canonicalHeading(line);
      if (!sections[current]) {
        sections[current] = [];
      }
      continue;
    }
    sections[current].push(line);
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
  const replacements = [
    [/^(helped with|helped)\s+/i, "Supported "],
    [/^(worked on)\s+/i, "Executed "],
    [/^(responsible for)\s+/i, "Owned "],
    [/^(assisted with|assisted)\s+/i, "Coordinated "],
    [/^(supported)\s+/i, "Supported "],
    [/^(tasked with)\s+/i, "Owned "]
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(cleaned)) {
      return cleaned.replace(pattern, replacement);
    }
  }

  return cleaned;
}

function extractCandidateSkills(text = "") {
  const sanitized = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/[|]/g, "\n");
  const chunks = sanitized
    .split(/[\n,;()]/)
    .flatMap((part) => part.split(/\band\b/gi))
    .map((part) => part.trim())
    .filter(Boolean);
  const scored = new Map();

  for (const raw of chunks) {
    const token = raw
      .replace(/^[^A-Za-z0-9+#/]+|[^A-Za-z0-9.+#/]+$/g, "")
      .replace(/\.+$/g, "")
      .trim();
    const lowered = token.toLowerCase();
    const wordCount = token.split(/\s+/).length;
    if (token.length < 2 || token.length > 30 || wordCount > 2) {
      continue;
    }
    if (STOPWORDS.has(lowered) || /^\d+$/.test(token) || /^[A-Z]{2}$/.test(token)) {
      continue;
    }
    if (SECTION_HEADERS.includes(lowered) || Object.keys(SECTION_ALIASES).includes(lowered)) {
      continue;
    }
    if (lowered.endsWith(" experience")) {
      continue;
    }
    if (/^[a-z]+$/.test(token) && token.length < 4) {
      continue;
    }
    if (/\b(led|built|worked|managed|partnered|owned|created|designed|delivered|improved)\b/i.test(token)) {
      continue;
    }
    const score = scored.get(token) || 0;
    scored.set(token, score + 1);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token)
    .filter((token) => /[A-Z]|[+#/.]/.test(token) || token.length > 5)
    .slice(0, 20);
}

function topMissingKeywords(linkedinText = "", resumeText = "") {
  const linkedInTokens = extractCandidateSkills(linkedinText);
  const resumeLower = resumeText.toLowerCase();
  return linkedInTokens.filter((token) => !resumeLower.includes(token.toLowerCase())).slice(0, 8);
}

function inferProfessionalLabel(linkedinText = "", targetRole = "") {
  const firstLine = splitLines(linkedinText)[0] || "";
  const beforeWith = firstLine.split(/\bwith\b/i)[0].trim();
  if (beforeWith && beforeWith.length <= 40) {
    return beforeWith.replace(/[.]+$/, "");
  }

  const role = String(targetRole || "").trim();
  if (role) {
    return role;
  }

  return "Candidate";
}

function summarizeProfile({ linkedinText, skillText, targetRole }) {
  const skills = extractCandidateSkills(`${linkedinText}\n${skillText}`).slice(0, 5);
  const role = targetRole?.trim() || "your target role";
  const label = inferProfessionalLabel(linkedinText, targetRole);
  if (skills.length) {
    return `${label} targeting ${role} roles with strengths in ${skills.join(", ")}.`;
  }

  return `${label} targeting ${role} roles with experience across execution, collaboration, and delivery.`;
}

function sectionsFromText(text = "") {
  return parseSections(normalizeWhitespace(text));
}

function strengthenBullet(bullet, index) {
  const cleaned = normalizeWeakOpener(bullet.replace(/\s+/g, " ").trim());
  if (!cleaned) {
    return null;
  }

  const startsWithVerb = ACTION_VERB_PATTERN.test(cleaned);
  const verb = ACTION_VERBS[index % ACTION_VERBS.length];
  const prefix = startsWithVerb ? "" : `${verb} `;
  return `${prefix}${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
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
  } else if (ACTION_VERB_PATTERN.test(cleaned)) {
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

function formatExperienceLines(lines = []) {
  const cleanedLines = lines.map((line) => line.trim()).filter(Boolean);
  if (!cleanedLines.length) {
    return [];
  }

  const entries = [];
  let bulletIndex = 0;

  for (const line of cleanedLines) {
    if (/^[-*•]/.test(line)) {
      const normalized = strengthenBullet(line.replace(/^[-*•]\s*/, ""), bulletIndex);
      bulletIndex += 1;
      if (normalized) {
        entries.push(`- ${normalized}`);
      }
      continue;
    }

    entries.push(line);
  }

  return entries;
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

  if (!summaryLines.length) {
    suggestions.push({
      priority: "high",
      title: "Add a professional summary",
      detail: `Your resume should open with a 2-3 line summary tailored to ${targetRole || "the role you want"}.`
    });
  }

  if (!skillLines.length) {
    suggestions.push({
      priority: "high",
      title: "Add a skills section",
      detail: "Create a dedicated skills section so recruiters and ATS scanners can match keywords quickly."
    });
  }

  if (experienceLines.length && !bullets.length) {
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

function buildDraft({ sections, bullets, linkedinText, resumeText, targetRole }) {
  const header = (sections.header || []).slice(0, 4);
  const skillSectionText = [
    ...(sections.skills || []),
    ...(sections["technical skills"] || []),
    ...(sections["core competencies"] || [])
  ].join("\n");
  const summary = summarizeProfile({ linkedinText, skillText: skillSectionText, targetRole });
  const skills = [...new Set([
    ...extractCandidateSkills(linkedinText),
    ...extractCandidateSkills(skillSectionText)
  ])].slice(0, 12);
  const experienceLines = formatExperienceLines(
    (sections.experience || sections["work experience"] || []).length
      ? (sections.experience || sections["work experience"] || [])
      : splitLines(resumeText).filter((line) => /^[-*•]/.test(line))
  ).slice(0, 10);

  const education = sections.education || [];
  const projects = sections.projects || [];

  const output = [];
  if (header.length) {
    output.push(...header, "");
  }
  output.push("SUMMARY");
  output.push(summary, "");

  if (skills.length) {
    output.push("SKILLS");
    output.push(skills.join(" | "), "");
  }

  if (experienceLines.length) {
    output.push("EXPERIENCE");
    for (const line of experienceLines) {
      output.push(line);
    }
    output.push("");
  }

  if (projects.length) {
    output.push("PROJECTS");
    for (const line of projects.slice(0, 6)) {
      output.push(`- ${line.replace(/^[-*•]\s*/, "")}`);
    }
    output.push("");
  }

  if (education.length) {
    output.push("EDUCATION");
    output.push(...education.slice(0, 4), "");
  }

  return output.join("\n").trim();
}

export function analyzeResume({ linkedinText = "", linkedinUrl = "", resumeText = "", targetRole = "" }) {
  const normalizedResume = normalizeWhitespace(resumeText);
  const normalizedLinkedIn = normalizeWhitespace(linkedinText);
  const sections = parseSections(normalizedResume);
  const bullets = extractBullets(normalizedResume);
  const bulletLint = lintBullets(bullets);
  const suggestions = buildSuggestions({
    sections,
    bullets,
    resumeText: normalizedResume,
    linkedinText: normalizedLinkedIn,
    targetRole
  });
  const missingKeywords = topMissingKeywords(normalizedLinkedIn, normalizedResume);

  return {
    meta: {
      linkedinUrl: linkedinUrl.trim(),
      targetRole: targetRole.trim(),
      resumeCharacters: normalizedResume.length,
      linkedinCharacters: normalizedLinkedIn.length
    },
    extracted: {
      sections: Object.keys(sections),
      bullets: bullets.length,
      missingKeywords,
      bulletQualityScore: Number(bulletLint.averageScore.toFixed(1)),
      weakBulletCount: bulletLint.failingBullets.length
    },
    lint: bulletLint,
    suggestions,
    rewrittenResume: buildDraft({
      sections,
      bullets,
      linkedinText: normalizedLinkedIn,
      resumeText: normalizedResume,
      targetRole
    })
  };
}
