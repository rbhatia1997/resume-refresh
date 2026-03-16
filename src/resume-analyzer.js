const SECTION_HEADERS = [
  "summary",
  "professional summary",
  "profile",
  "experience",
  "work experience",
  "employment",
  "projects",
  "education",
  "skills",
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
  "Automated", "Streamlined", "Reduced", "Increased", "Implemented", "Created"
];

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

function parseSections(text = "") {
  const lines = splitLines(text);
  const sections = {};
  let current = "header";
  sections[current] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      current = line.toLowerCase().replace(/[^a-z ]/g, "").trim();
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
    if (token.length < 2 || token.length > 30 || wordCount > 3) {
      continue;
    }
    if (STOPWORDS.has(lowered) || /^\d+$/.test(token)) {
      continue;
    }
    if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(token)) {
      continue;
    }
    if (/^[a-z]+$/.test(token) && token.length < 4) {
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

function summarizeProfile({ linkedinText, resumeText, targetRole }) {
  const source = normalizeWhitespace(`${linkedinText}\n${resumeText}`);
  const roleSignals = [
    ...(sectionsFromText(linkedinText).experience || []),
    ...(sectionsFromText(resumeText).experience || []),
    ...extractBullets(linkedinText),
    ...extractBullets(resumeText)
  ].join(" ");
  const skills = extractCandidateSkills(`${linkedinText}\n${roleSignals}`).slice(0, 8);
  const role = targetRole?.trim() || "your target role";
  const firstSentence = source
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .find((line) => line.length > 50);

  if (firstSentence) {
    return `${firstSentence} Focused on ${role}, with emphasis on ${skills.slice(0, 4).join(", ")}.`;
  }

  return `Results-oriented candidate targeting ${role}, with strengths in ${skills.slice(0, 5).join(", ")}.`;
}

function sectionsFromText(text = "") {
  return parseSections(normalizeWhitespace(text));
}

function strengthenBullet(bullet, index) {
  const cleaned = bullet.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  const startsWithVerb = /^[A-Z][a-z]+ed\b|^[A-Z][a-z]+ing\b/.test(cleaned);
  const hasMetric = /\b\d+[%xX]?|\$\d|percent|million|billion|kpi|roi|sla|okr/i.test(cleaned);
  const verb = ACTION_VERBS[index % ACTION_VERBS.length];
  const prefix = startsWithVerb ? "" : `${verb} `;
  const suffix = hasMetric ? "" : " Add a measurable outcome if you have one.";
  return `${prefix}${cleaned}${suffix}`;
}

function buildSuggestions({ sections, bullets, resumeText, linkedinText, targetRole }) {
  const suggestions = [];
  const summaryLines = sections.summary || sections["professional summary"] || sections.profile || [];
  const skillLines = sections.skills || sections["technical skills"] || sections["core competencies"] || [];
  const experienceLines = sections.experience || sections["work experience"] || sections.employment || [];
  const metricsCount = (resumeText.match(/\b\d+[%xX]?|\$\d/g) || []).length;
  const missingKeywords = topMissingKeywords(linkedinText, resumeText);

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

  return suggestions;
}

function buildDraft({ sections, bullets, linkedinText, resumeText, targetRole }) {
  const header = (sections.header || []).slice(0, 4);
  const summary = summarizeProfile({ linkedinText, resumeText, targetRole });
  const skills = [...new Set([
    ...extractCandidateSkills(linkedinText),
    ...extractCandidateSkills((sections.skills || sections["technical skills"] || []).join("\n")),
    ...extractCandidateSkills((sections.experience || sections["work experience"] || []).join("\n"))
  ])].slice(0, 12);

  const improvedBullets = (bullets.length ? bullets : splitLines(sections.experience?.join("\n") || ""))
    .slice(0, 8)
    .map((bullet, index) => strengthenBullet(bullet, index))
    .filter(Boolean);

  const education = sections.education || [];
  const projects = sections.projects || [];

  const output = [];
  if (header.length) {
    output.push(...header, "");
  }
  output.push("PROFESSIONAL SUMMARY");
  output.push(summary, "");

  if (skills.length) {
    output.push("CORE SKILLS");
    output.push(skills.join(" | "), "");
  }

  if (improvedBullets.length) {
    output.push("EXPERIENCE HIGHLIGHTS");
    for (const bullet of improvedBullets) {
      output.push(`- ${bullet}`);
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
      missingKeywords
    },
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
