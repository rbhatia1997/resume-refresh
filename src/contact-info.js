const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[A-Za-z0-9_-]+|github\.com\/[A-Za-z0-9_-]+|[A-Za-z0-9.-]+\.[A-Z]{2,}(?:\/[^\s|,]*)?)\b/i;

const NON_NAME_WORDS = new Set([
  "home", "jobs", "messaging", "notifications", "premium", "linkedin",
  "search", "me", "work", "learning", "resume", "curriculum", "vitae", "cv"
]);

function splitHeaderParts(lines = []) {
  return lines
    .flatMap((line) => String(line || "").split(/\s*[|•·]\s*|\s{2,}/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeName(value = "") {
  const text = value.trim();
  if (!text || EMAIL_RE.test(text) || PHONE_RE.test(text) || URL_RE.test(text)) {
    return false;
  }
  if (/\d/.test(text) || text.length > 60) {
    return false;
  }
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return false;
  }
  if (words.some((word) => NON_NAME_WORDS.has(word))) {
    return false;
  }
  return /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(text);
}

function looksLikeLocation(value = "") {
  const text = value.trim();
  if (!text || EMAIL_RE.test(text) || PHONE_RE.test(text) || URL_RE.test(text)) {
    return false;
  }
  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(text)
    || /\b(remote|hybrid)\b/i.test(text);
}

export function extractContactInfo(headerLines = []) {
  const lines = headerLines.map((line) => String(line || "").trim()).filter(Boolean);
  const joined = lines.join(" | ");
  const parts = splitHeaderParts(lines);

  const email = joined.match(EMAIL_RE)?.[0] || "";
  const phone = joined.match(PHONE_RE)?.[0] || "";
  const links = [...new Set(parts
    .filter((part) => !part.includes("@"))
    .map((part) => part.match(URL_RE)?.[0] || "")
    .filter((url) => url && !EMAIL_RE.test(url)))];

  const name = parts.find(looksLikeName) || "";
  const location = parts.find(looksLikeLocation) || "";

  return {
    name,
    email,
    phone,
    location,
    links
  };
}

function missingFieldSuggestion({ id, title, detail, field }) {
  return {
    id,
    type: "missing-field",
    severity: "high",
    title,
    detail,
    originalText: "",
    suggestedText: "",
    rationale: "Contact info should include email, phone, and name.",
    applyMode: "insert-field",
    field
  };
}

function optionalLinkSuggestion({ id, title, detail, field, suggestedText }) {
  return {
    id,
    type: "optional-link",
    severity: "low",
    title,
    detail,
    originalText: "",
    suggestedText,
    rationale: "Profile links are optional, but they help recruiters verify relevant work quickly.",
    applyMode: "insert-field",
    field
  };
}

function classifyLinks(links = []) {
  const normalized = links.map((link) => String(link || "").toLowerCase());
  return {
    hasLinkedIn: normalized.some((link) => /linkedin\.com\/in\//.test(link)),
    hasGithub: normalized.some((link) => /github\.com\//.test(link)),
    hasPortfolio: normalized.some((link) => link && !/linkedin\.com\/in\/|github\.com\//.test(link))
  };
}

export function buildContactSuggestions(contact = {}) {
  const suggestions = [];

  if (!contact.name) {
    suggestions.push(missingFieldSuggestion({
      id: "contact-name-missing",
      title: "Name unclear",
      detail: "Add your full name at the top of the resume.",
      field: "name"
    }));
  }

  if (!contact.email) {
    suggestions.push(missingFieldSuggestion({
      id: "contact-email-missing",
      title: "Email missing",
      detail: "Add an email address so recruiters can contact you.",
      field: "email"
    }));
  }

  if (!contact.phone) {
    suggestions.push(missingFieldSuggestion({
      id: "contact-phone-missing",
      title: "Phone missing",
      detail: "Add a phone number if this resume is for direct applications.",
      field: "phone"
    }));
  }

  if (suggestions.length) {
    return suggestions;
  }

  const { hasLinkedIn, hasGithub, hasPortfolio } = classifyLinks(contact.links || []);

  if (!hasLinkedIn) {
    suggestions.push(optionalLinkSuggestion({
      id: "contact-linkedin-optional",
      title: "Add LinkedIn",
      detail: "Include a LinkedIn URL if the profile is current and aligned with this resume.",
      field: "linkedin",
      suggestedText: "LinkedIn: https://linkedin.com/in/your-handle"
    }));
  }

  if (!hasGithub) {
    suggestions.push(optionalLinkSuggestion({
      id: "contact-github-optional",
      title: "Add GitHub",
      detail: "Add GitHub if it shows projects, scripts, troubleshooting notes, or technical work worth reviewing.",
      field: "github",
      suggestedText: "GitHub: https://github.com/your-handle"
    }));
  }

  if (!hasPortfolio) {
    suggestions.push(optionalLinkSuggestion({
      id: "contact-portfolio-optional",
      title: "Add portfolio or website",
      detail: "Use this for a portfolio, personal site, certification profile, or other relevant work sample.",
      field: "portfolio",
      suggestedText: "Portfolio: https://your-site.com"
    }));
  }

  return suggestions;
}
