const MONTH_OR_SEASON_RE = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter)`;
const YEAR_RE = String.raw`(?:19|20)\d{2}`;
const DATE_POINT_RE = String.raw`(?:(?:${MONTH_OR_SEASON_RE})\s+)?${YEAR_RE}`;
const SEASON_DATE_POINT_RE = String.raw`(?:${MONTH_OR_SEASON_RE})\s+${YEAR_RE}`;
const DATE_RANGE_SOURCE = String.raw`(?:${DATE_POINT_RE}\s*[-–—/]\s*(?:${DATE_POINT_RE}|present|current|now)|${SEASON_DATE_POINT_RE})`;
export const DATE_RANGE_RE = new RegExp(DATE_RANGE_SOURCE, "i");
const DATE_RANGE_GLOBAL_RE = new RegExp(DATE_RANGE_SOURCE, "ig");

const TITLE_WORD_RE = /\b(engineer|manager|analyst|designer|developer|director|specialist|associate|lead|senior|junior|consultant|coordinator|intern|founder|president|officer|strategist|scientist|architect|technician|chef)\b/i;
const ACTION_START_RE = /^(troubleshoot|resolve|diagnose|support|install|replace|configure|configured|deploy|deployed|maintain|maintained|document|documented|deliver|delivered|manage|managed|assist|assisted|prepare|prepared|coordinate|coordinated|operate|operated|repair|repaired|image|imaged|build|built|lead|led|own|owned|provide|provided)\b/i;

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
  const text = String(line || "");
  const matches = Array.from(text.matchAll(DATE_RANGE_GLOBAL_RE));
  if (!matches.length) {
    return { withoutDate: text.trim(), dateRange: "" };
  }

  const lastMatch = matches[matches.length - 1];
  return {
    withoutDate: text
      .replace(DATE_RANGE_GLOBAL_RE, " ")
      .replace(/\s*[|,–—-]\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
    dateRange: lastMatch[0].trim()
  };
}

function cleanTitle(value = "") {
  return String(value || "").replace(/\s*[-–—]\s*$/, "").trim();
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
      if (TITLE_WORD_RE.test(compact[0]) || /[-–—]\s*$/.test(compact[0])) {
        title = cleanTitle(compact[0]);
        const companyLocation = compact[1] || "";
        const commaParts = companyLocation.split(/\s*,\s*/).filter(Boolean);
        company = commaParts[0] || companyLocation;
        location = compact[2] || commaParts.slice(1).join(", ");
      } else {
        company = compact[0] || "";
        title = compact[1] || "";
        location = compact[2] || "";
      }
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
    title: cleanTitle(title),
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

  function appendToPreviousBullet(fragment) {
    const lastIndex = current.bullets.length - 1;
    const previous = current.bullets[lastIndex] || "";
    current.bullets[lastIndex] = previous.endsWith("-")
      ? `${previous}${fragment}`
      : `${previous} ${fragment}`;
  }

  function pushUnmarkedBullet(text, { forceNew = false } = {}) {
    if (!current) startEntry();
    inBullets = true;
    const cleaned = String(text || "").trim().replace(/^[-*•]\s*/, "");
    if (!cleaned) return;

    const startsNewBullet = forceNew || ACTION_START_RE.test(cleaned) || current.bullets.length === 0;
    if (!startsNewBullet && current.bullets.length) {
      appendToPreviousBullet(cleaned);
      return;
    }
    current.bullets.push(cleaned);
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
      pushUnmarkedBullet(t, { forceNew: true });
      continue;
    }

    if (inBullets) {
      if (looksLikeNewRoleStart(t)) {
        startEntry();
      } else {
        if (isDateOnly) {
          current.dateRange = t;
        } else {
          pushUnmarkedBullet(t);
        }
        continue;
      }
    }

    if (current?.dateRange && !looksLikeNewRoleStart(t)) {
      pushUnmarkedBullet(t);
      continue;
    }

    if (!inBullets && current && current.bullets.length > 0 && looksLikeNewRoleStart(t)) {
      startEntry();
    }

    if (!inBullets && current && current.bullets.length > 0 && !looksLikeNewRoleStart(t)) {
      pushUnmarkedBullet(t);
      continue;
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

export function formatExperienceEntryHeading(entry = {}, { alignDate = false, width = 76 } = {}) {
  const left = [
    entry.title || "",
    [entry.company || "", entry.location || ""].filter(Boolean).join(", ")
  ].filter(Boolean).join(" - ");

  if (alignDate && entry.dateRange) {
    const gap = Math.max(2, width - left.length - entry.dateRange.length);
    return `${left}${" ".repeat(gap)}${entry.dateRange}`;
  }

  return [left, entry.dateRange || ""].filter(Boolean).join(" ").trim();
}
