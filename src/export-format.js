const MONTH_OR_SEASON_RE = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Spring|Summer|Fall|Winter)`;
const DATE_POINT_RE = String.raw`(?:(?:${MONTH_OR_SEASON_RE})\s+)?(?:19|20)\d{2}`;
const TRAILING_DATE_RE = new RegExp(String.raw`\s+(${DATE_POINT_RE}\s*[-\u2013\u2014]\s*(?:Present|Current|Now|${DATE_POINT_RE})|${MONTH_OR_SEASON_RE}\s+(?:19|20)\d{2})$`, "i");

/**
 * Detect and split a trailing date range from a job title line.
 * "Software Engineer | Acme Corp Jan 2022 - Present"
 *   -> { role: "Software Engineer | Acme Corp", date: "Jan 2022 - Present" }
 * Returns null if no date is found.
 */
export function splitJobDate(line = "") {
  if (/^[-*\u2022]/.test(line)) return null;
  const match = String(line || "").match(TRAILING_DATE_RE);
  if (!match) return null;
  return {
    role: line.slice(0, match.index).trim(),
    date: match[1].trim()
  };
}
