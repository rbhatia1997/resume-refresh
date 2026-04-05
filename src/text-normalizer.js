/**
 * text-normalizer.js
 *
 * Cleans up messy pasted text from Discord, LinkedIn, PDF extraction,
 * Notes apps, etc. before it hits the resume analyzer.
 *
 * Goals:
 * - Remove platform UI noise (nav items, reactions, timestamps)
 * - Deduplicate repeated lines/sections
 * - Collapse excessive blank lines
 * - Normalize bullet characters to "-"
 * - Preserve all meaningful resume content
 */

// ── Discord artifacts ──────────────────────────────────────────────
// "Username — Today at 2:34 PM"  or  "Username — 1/14/2025 3:12 PM"
const RE_DISCORD_USER_LINE = /^.{1,80}\s+[—–]\s+(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+\d/i;
// Emoji reactions: "👍 3" / "❤️ 12"
const RE_DISCORD_REACTION  = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✓✗☑]\s*\d+$/u;
// Discord system messages
const RE_DISCORD_META      = /^(pinned a message|replied to|reacted with|added a reaction|started a thread|joined the server)/i;

// ── LinkedIn UI noise ──────────────────────────────────────────────
const LINKEDIN_NAV_TERMS = new Set([
  'linkedin', 'home', 'jobs', 'messaging', 'notifications', 'premium',
  'search', 'me', 'work', 'learning', 'interests', 'following & followers',
  'try premium', 'upgrade'
]);
const RE_LINKEDIN_JUNK = [
  /^\d+\+?\s+connections?$/i,
  /^(following|followers?|connect|message|more\.{0,3}|see (all|more))$/i,
  /^show\s+(all|more)/i,
  /^(endorsed by|and \d+ (other people|others))/i,
  /^(open to|save to pdf|report|share profile)/i,
  /^(you (might|may)( also)? (know|like)|people also viewed)/i,
  /^(activity|posts?|articles?|documents?|highlights?)\s*$/i,
  /^\d+\s+(post|article|follower|connection)/i,
];

// ── PDF extraction artifacts ───────────────────────────────────────
const RE_PDF_ARTIFACTS = [
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^-\s*\d+\s*-$/,          // "- 1 -" page markers
  /^\d+\s*$/,               // lone page numbers (single line)
  /^(confidential|draft|internal use only|do not distribute)$/i,
];

// ── Timestamp-only lines ───────────────────────────────────────────
// ISO 8601 and common datetime formats
const RE_TIMESTAMP_ONLY = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
// "January 15, 2024 at 3:00 PM"
const RE_VERBOSE_TIMESTAMP = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d/i;

// ── Bullet normalization ───────────────────────────────────────────
// Various bullet chars → "-"
const RE_BULLET_CHARS = /^(\s*)[•·▸▹►→✦✧❖◆◇▪▫◉○●]\s+/;

function isDiscordArtifact(line) {
  return RE_DISCORD_USER_LINE.test(line)
    || RE_DISCORD_REACTION.test(line)
    || RE_DISCORD_META.test(line);
}

function isLinkedInJunk(line) {
  const t = line.trim().toLowerCase();
  if (LINKEDIN_NAV_TERMS.has(t)) return true;
  if (RE_LINKEDIN_JUNK.some(p => p.test(line.trim()))) return true;
  // Multi-word lines where every token is a known nav term (e.g. "Home  Jobs  LinkedIn")
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every(tok => LINKEDIN_NAV_TERMS.has(tok))) return true;
  return false;
}

function isPdfArtifact(line) {
  return RE_PDF_ARTIFACTS.some(p => p.test(line.trim()));
}

function isTimestampOnly(line) {
  const t = line.trim();
  return RE_TIMESTAMP_ONLY.test(t) || RE_VERBOSE_TIMESTAMP.test(t);
}

/**
 * Normalize a bullet character to "-" for consistent parsing.
 */
function normalizeBullet(line) {
  return line.replace(RE_BULLET_CHARS, '$1- ');
}

/**
 * Remove obviously repeated lines while keeping structural blank lines.
 * Case-insensitive, trims before comparing.
 */
function deduplicateLines(lines) {
  const seen = new Set();
  return lines.filter(line => {
    const key = line.trim().toLowerCase();
    if (!key) return true; // keep blanks
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collapse runs of 3+ blank lines down to at most 2.
 */
function collapseBlankLines(lines) {
  const out = [];
  let blankRun = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blankRun++;
      if (blankRun <= 2) out.push(line);
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  return out;
}

/**
 * Main export. Cleans messy pasted text before analysis.
 * Safe to call on empty or undefined input.
 */
export function normalizeInputText(text = '') {
  if (!text || typeof text !== 'string') return '';

  // Normalize line endings
  let lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Filter junk lines
  lines = lines.filter(line => {
    const t = line.trim();
    if (!t) return true; // preserve blank lines for now
    if (isDiscordArtifact(t)) return false;
    if (isLinkedInJunk(t)) return false;
    if (isPdfArtifact(t)) return false;
    if (isTimestampOnly(t)) return false;
    return true;
  });

  // Normalize bullets
  lines = lines.map(normalizeBullet);

  // Deduplicate
  lines = deduplicateLines(lines);

  // Collapse excessive blank lines
  lines = collapseBlankLines(lines);

  return lines.join('\n').trim();
}
