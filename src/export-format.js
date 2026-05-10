const MONTH_OR_SEASON_RE = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Spring|Summer|Fall|Autumn|Winter)`;
const DATE_POINT_RE = String.raw`(?:(?:${MONTH_OR_SEASON_RE})\s+)?(?:19|20)\d{2}`;
const DATE_RANGE_SOURCE = String.raw`(?:${DATE_POINT_RE}\s*[-\u2013\u2014/]\s*(?:Present|Current|Now|${DATE_POINT_RE})|${MONTH_OR_SEASON_RE}\s+(?:19|20)\d{2})`;
const DATE_RANGE_RE = new RegExp(DATE_RANGE_SOURCE, "ig");
const TRAILING_DATE_RE = new RegExp(String.raw`\s*(?:[|,]\s*)?(${DATE_RANGE_SOURCE})$`, "i");

function cleanRoleDatePrefix(text, firstDateIndex) {
  return text
    .slice(0, firstDateIndex)
    .replace(/\s*[|,\u2013\u2014-]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Detect and split a trailing date range from a job title line.
 * "Software Engineer | Acme Corp Jan 2022 - Present"
 *   -> { role: "Software Engineer | Acme Corp", date: "Jan 2022 - Present" }
 * Returns null if no date is found.
 */
export function splitJobDate(line = "") {
  const text = String(line || "").trim();
  if (/^[-*\u2022]/.test(text)) return null;

  const trailingMatch = text.match(TRAILING_DATE_RE);
  if (!trailingMatch) return null;

  const dateMatches = Array.from(text.matchAll(DATE_RANGE_RE));
  const firstDateIndex = dateMatches[0]?.index ?? trailingMatch.index;
  const role = cleanRoleDatePrefix(text, firstDateIndex);
  if (!role) return null;

  return {
    role,
    date: trailingMatch[1].trim()
  };
}
