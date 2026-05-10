import { buildContactSuggestions } from "./contact-info.js";
import { buildSkillActionPreview, normalizeSkillLines } from "./skills-grounding.js";

const GENERIC_SUMMARY_RE = /\b(hard.?working|team player|self.?starter|detail.?oriented|results.?driven|motivated|looking for|seeking (?:a )?new opportunity)\b/i;
const FIRST_PERSON_RE = /\b(I|my|me)\b/i;
const WEAK_OPENER_RE = /^(helped|helped with|worked on|responsible for|assisted|assisted with|tasked with)\b/i;

function makeSuggestion({
  id,
  type,
  severity = "medium",
  title,
  detail,
  originalText = "",
  suggestedText = "",
  rationale = "",
  applyMode = "informational",
  field = ""
}) {
  return {
    id,
    type,
    severity,
    title,
    detail,
    originalText,
    suggestedText,
    rationale,
    applyMode,
    ...(field ? { field } : {})
  };
}

function titleCaseRole(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function buildSuggestedSummary({ targetRole = "", candidateLevel = "", skills = [] }) {
  const role = titleCaseRole(targetRole) || "Professional";
  const skillPhrase = skills.length
    ? `with strengths in ${skills.slice(0, 3).join(", ")}`
    : "with experience translating work into clear outcomes";
  const levelPhrase = candidateLevel === "early-career" || candidateLevel === "new-grad"
    ? "Early-career"
    : "";
  return `${levelPhrase ? `${levelPhrase} ` : ""}${role} ${skillPhrase}. Focused on reliable execution, clear communication, and measurable impact.`.trim();
}

export function buildSummarySuggestions({
  currentText = "",
  targetRole = "",
  candidateLevel = "",
  skills = []
} = {}) {
  const text = String(currentText || "").trim();
  const needsRewrite = !text || text.length < 80 || GENERIC_SUMMARY_RE.test(text) || FIRST_PERSON_RE.test(text);
  if (!needsRewrite) return [];

  return [makeSuggestion({
    id: "summary-rewrite",
    type: "summary-rewrite",
    severity: text ? "medium" : "high",
    title: "Suggested summary rewrite",
    detail: text
      ? "This summary is generic or too thin for the target role."
      : "Add a short summary that frames your resume for the target role.",
    originalText: text,
    suggestedText: buildSuggestedSummary({ targetRole, candidateLevel, skills }),
    rationale: "A strong summary should connect your direction, strengths, and target role without first-person language.",
    applyMode: "replace-section"
  })];
}

function normalizeWeakBullet(bullet = "") {
  const cleaned = String(bullet || "").trim();
  return cleaned
    .replace(/^(worked on)\s+installing\b/i, "Installed")
    .replace(/^(worked on)\s+/i, "Owned ")
    .replace(/^(helped with|helped)\s+/i, "Supported ")
    .replace(/^(responsible for)\s+/i, "Owned ")
    .replace(/^(assisted with|assisted)\s+/i, "Coordinated ")
    .replace(/^(tasked with)\s+/i, "Owned ");
}

export function buildExperienceSuggestions({ entries = [] } = {}) {
  const suggestions = [];

  entries.forEach((entry, entryIndex) => {
    if ((entry.title || entry.company || entry.bullets?.length) && !entry.dateRange) {
      suggestions.push(makeSuggestion({
        id: `experience-${entryIndex}-date-missing`,
        type: "missing-date",
        severity: "high",
        title: "Dates missing",
        detail: "Add a date range for this role so the timeline is credible.",
        originalText: "",
        suggestedText: "",
        rationale: "Recruiters expect role timelines in the experience section.",
        applyMode: "informational"
      }));
    }

    (entry.bullets || []).forEach((bullet, bulletIndex) => {
      if (WEAK_OPENER_RE.test(bullet)) {
        const suggestedText = normalizeWeakBullet(bullet);
        suggestions.push(makeSuggestion({
          id: `experience-${entryIndex}-bullet-${bulletIndex}-weak-opener`,
          type: "bullet-rewrite",
          severity: "high",
          title: "Replace weak opener",
          detail: "Start this bullet with direct ownership or action.",
          originalText: bullet,
          suggestedText,
          rationale: "Stronger resume bullets lead with what you did, then clarify scope or result.",
          applyMode: "replace-line"
        }));
      } else if (!/\b(\d+[%x]?|\$\d+|increased|reduced|improved|saved|resolved|delivered|launched|supported)\b/i.test(bullet)) {
        suggestions.push(makeSuggestion({
          id: `experience-${entryIndex}-bullet-${bulletIndex}-scope-result`,
          type: "bullet-coaching",
          severity: "medium",
          title: "Add scope or result",
          detail: "If you know the scope, add volume, frequency, systems, locations, or outcome.",
          originalText: bullet,
          suggestedText: "",
          rationale: "Specific scope makes the bullet more credible without inventing metrics.",
          applyMode: "informational"
        }));
      }
    });
  });

  return suggestions;
}

export function buildSkillsSuggestions({ currentText = "", targetRole = "", supportingText = "" } = {}) {
  const normalized = normalizeSkillLines(currentText);
  const preview = buildSkillActionPreview({
    action: "align",
    currentText,
    targetRole,
    supportingText
  });

  if (!normalized.rejected.length && preview.suggested.length <= normalized.accepted.length) {
    return [];
  }

  return [makeSuggestion({
    id: "skills-align",
    type: "skills-list",
    severity: normalized.accepted.length < 3 ? "high" : "medium",
    title: "Clean up skills",
    detail: "Use recognizable, recruiter-facing skills with consistent casing.",
    originalText: normalized.accepted.join("\n"),
    suggestedText: preview.suggested.join("\n"),
    rationale: "A clean skills list is easier for recruiters and ATS systems to scan.",
    applyMode: "replace-section"
  })];
}

export function buildEducationSuggestions({ currentText = "" } = {}) {
  const text = String(currentText || "").trim();
  if (!text) return [];
  if (/\b(19|20)\d{2}\b/.test(text)) return [];

  return [makeSuggestion({
    id: "education-year-missing",
    type: "education-date",
    severity: "low",
    title: "Add education year",
    detail: "Add a graduation year or date range if it helps this resume.",
    originalText: text,
    suggestedText: "",
    rationale: "Education entries are easier to scan when dates are clear.",
    applyMode: "informational"
  })];
}

export { buildContactSuggestions };
