export const DATE_RANGE_RE = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}\s*[-–—/]\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:(?:19|20)\d{2}|present|current|now)/i;

const TITLE_WORD_RE = /\b(engineer|manager|analyst|designer|developer|director|specialist|associate|lead|senior|junior|consultant|coordinator|intern|founder|president|officer|strategist|scientist|architect|technician|support)\b/i;

export function isStandaloneDateLine(line) {
  const t = String(line || "").trim();
  if (!t || /^[-*•]/.test(t)) return false;
  const remainder = t.replace(DATE_RANGE_RE, "").replace(/[()[\]–—\-\/\s|,·]/g, "").trim();
  return DATE_RANGE_RE.test(t) && remainder.length < 8;
}

export function looksLikeNewRoleStart(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (/[|·]/.test(t)) return true;
  if (DATE_RANGE_RE.test(t)) return true;
  return t.length < 80 && TITLE_WORD_RE.test(t);
}

function splitDateFromLine(line = "") {
  const match = String(line).match(DATE_RANGE_RE);
  if (!match) {
    return { withoutDate: line.trim(), dateRange: "" };
  }
  return {
    withoutDate: line.replace(match[0], "").replace(/[|,–—-]\s*$/, "").trim(),
    dateRange: match[0].trim()
  };
}

function parseHeaderParts(headerLines = [], existingDateRange = "") {
  const compact = headerLines.map((line) => String(line || "").trim()).filter(Boolean);
  if (!compact.length) {
    return { title: "", company: "", location: "", dateRange: existingDateRange, headerLines: compact };
  }

  let joined = compact.join(" | ");
  const splitDate = splitDateFromLine(joined);
  joined = splitDate.withoutDate;
  const dateRange = existingDateRange || splitDate.dateRange;

  const pipeParts = joined.split(/\s*[|·]\s*/).map((part) => part.trim()).filter(Boolean);
  let title = "";
  let company = "";
  let location = "";

  if (pipeParts.length >= 3) {
    [title, company, location] = pipeParts;
  } else if (pipeParts.length === 2) {
    [title, company] = pipeParts;
  } else {
    const dashMatch = joined.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dashMatch) {
      title = dashMatch[1].trim();
      const companyLocation = dashMatch[2].trim();
      const commaParts = companyLocation.split(/\s*,\s*/).filter(Boolean);
      company = commaParts[0] || "";
      location = commaParts.slice(1).join(", ");
    } else if (compact.length >= 2) {
      company = compact[0] || "";
      title = compact[1] || "";
      location = compact[2] || "";
    } else {
      title = joined;
    }
  }

  if (!location && company.includes(",")) {
    const parts = company.split(/\s*,\s*/).filter(Boolean);
    company = parts[0] || company;
    location = parts.slice(1).join(", ");
  }

  return {
    title,
    company,
    location,
    dateRange,
    headerLines: compact
  };
}

function enrichEntry(entry) {
  const parsed = parseHeaderParts(entry.headerLines, entry.dateRange);
  const hasDates = Boolean(parsed.dateRange) || parsed.headerLines.some((line) => /\b(19|20)\d{2}\b/.test(line));
  const hasBullets = entry.bullets.length > 0;
  const hasTitle = parsed.headerLines.length > 0;

  return {
    ...entry,
    ...parsed,
    confidence: (hasDates && hasBullets && hasTitle) ? "high"
      : (hasBullets && hasTitle) ? "medium"
      : "low"
  };
}

export function parseExperienceEntries(lines = []) {
  const entries = [];
  let current = null;
  let inBullets = false;

  function flushEntry() {
    if (!current) return;
    if (current.headerLines.filter(Boolean).length || current.bullets.length) {
      entries.push(enrichEntry(current));
    }
    current = null;
    inBullets = false;
  }

  function startEntry() {
    flushEntry();
    current = { headerLines: [], dateRange: "", bullets: [] };
  }

  for (const line of lines) {
    const t = String(line || "").trim();

    if (!t) {
      if (inBullets && current?.bullets.length) flushEntry();
      continue;
    }

    const isBullet = /^[-*•]/.test(t);
    const isDateOnly = isStandaloneDateLine(t);

    if (isBullet) {
      if (!current) startEntry();
      inBullets = true;
      current.bullets.push(t.replace(/^[-*•]\s*/, "").trim());
      continue;
    }

    if (inBullets) {
      if (looksLikeNewRoleStart(t)) {
        startEntry();
      } else {
        inBullets = false;
        if (!current) startEntry();
        if (isDateOnly) {
          current.dateRange = t;
        } else {
          current.headerLines.push(t);
        }
        continue;
      }
    }

    if (!inBullets && current && current.bullets.length > 0 && looksLikeNewRoleStart(t)) {
      startEntry();
    }

    if (!current) startEntry();

    if (isDateOnly) {
      current.dateRange = t;
    } else {
      current.headerLines.push(t);
    }
  }

  flushEntry();
  return entries;
}

export function formatExperienceEntryHeading(entry = {}) {
  const left = [
    entry.title || "",
    [entry.company || "", entry.location || ""].filter(Boolean).join(", ")
  ].filter(Boolean).join(" - ");

  return [left, entry.dateRange || ""].filter(Boolean).join(" ").trim();
}
