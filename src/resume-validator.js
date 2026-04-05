const OPTIONAL_SECTION_HEADINGS = new Map([
  ["projects", "projects"],
  ["interests", "interests"],
  ["certifications", "certifications"],
  ["community", "community"],
  ["leadership", "community"],
  ["volunteer", "community"],
  ["volunteering", "community"]
]);

const REQUIRED_SECTIONS = ["header", "summary", "experience"];

function normalizeText(value = "") {
  return String(value).replace(/\r/g, "").trim();
}

function parseSectionsFromText(text = "") {
  const lines = normalizeText(text).split("\n").map((line) => line.trimEnd());
  const sections = {
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
  const headingMap = new Map([
    ["summary", "summary"],
    ["professional summary", "summary"],
    ["profile", "summary"],
    ["about", "summary"],
    ["experience", "experience"],
    ["work experience", "experience"],
    ["employment", "experience"],
    ["skills", "skills"],
    ["core skills", "skills"],
    ["technical skills", "skills"],
    ["education", "education"],
    ...OPTIONAL_SECTION_HEADINGS.entries()
  ]);

  let current = "header";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current !== "header" && sections[current].length && sections[current][sections[current].length - 1] !== "") {
        sections[current].push("");
      }
      continue;
    }
    const canonical = headingMap.get(trimmed.toLowerCase().replace(/[^a-z ]/g, "").trim());
    if (canonical) {
      current = canonical;
      continue;
    }
    sections[current].push(trimmed);
  }

  return sections;
}

function hasExperienceDates(value = "") {
  return /\b(19|20)\d{2}\b/.test(value);
}

function hasRoleAndCompany(value = "") {
  const firstMeaningfulLine = normalizeText(value).split("\n").find((line) => line.trim() && !/^[-*•]/.test(line));
  if (!firstMeaningfulLine) {
    return false;
  }
  return /,|\|| at /i.test(firstMeaningfulLine);
}

function buildValidationFromSectionMap(sectionMap) {
  const normalizedSections = Object.fromEntries(
    Object.entries(sectionMap).map(([key, lines]) => [key, normalizeText(Array.isArray(lines) ? lines.join("\n") : lines)])
  );
  const presentSections = Object.entries(normalizedSections)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const blockingIssues = [];
  for (const id of REQUIRED_SECTIONS) {
    if (!normalizedSections[id]) {
      blockingIssues.push({ id: `missing-${id}`, sectionId: id, message: `${id[0].toUpperCase()}${id.slice(1)} is required before final review.` });
    }
  }

  if (normalizedSections.experience && !hasExperienceDates(normalizedSections.experience)) {
    blockingIssues.push({ id: "experience-dates", sectionId: "experience", message: "Add dates to experience entries before export." });
  }

  if (normalizedSections.experience && !hasRoleAndCompany(normalizedSections.experience)) {
    blockingIssues.push({ id: "experience-role-company", sectionId: "experience", message: "Experience should clearly show role and company on the entry heading." });
  }

  const warnings = [];
  if (normalizedSections.education && !/\b(19|20)\d{2}\b/.test(normalizedSections.education)) {
    warnings.push({ id: "education-year", sectionId: "education", message: "Education is easier to scan with a graduation year or date." });
  }
  if (normalizedSections.skills && normalizedSections.skills.split("\n").length < 3) {
    warnings.push({ id: "skills-thin", sectionId: "skills", message: "Skills can be tighter and more complete before export." });
  }

  const atsChecks = [
    {
      id: "ats-headings",
      label: "Standard section headings",
      status: normalizedSections.summary && normalizedSections.experience ? "pass" : "warn",
      detail: "Use clear headings like Summary, Experience, Skills, and Education."
    },
    {
      id: "ats-dates",
      label: "Experience dates present",
      status: normalizedSections.experience ? (hasExperienceDates(normalizedSections.experience) ? "pass" : "fail") : "fail",
      detail: "Recruiters and ATS systems expect visible timelines for roles."
    },
    {
      id: "ats-role-company",
      label: "Role and company are clear",
      status: normalizedSections.experience ? (hasRoleAndCompany(normalizedSections.experience) ? "pass" : "fail") : "fail",
      detail: "Each experience entry should clearly show title and company."
    },
    {
      id: "ats-skills",
      label: "Skills are scan-friendly",
      status: normalizedSections.skills ? "pass" : "warn",
      detail: "Keep skills standardized and easy to parse."
    }
  ];

  return {
    presentSections,
    blockingIssues,
    warnings,
    atsChecks
  };
}

export function buildResumeValidation(sections = []) {
  const sectionMap = Object.fromEntries(
    sections.map((section) => [section.id, section.content || ""])
  );
  return buildValidationFromSectionMap(sectionMap);
}

export function buildResumeValidationFromText(text = "") {
  return buildValidationFromSectionMap(parseSectionsFromText(text));
}
