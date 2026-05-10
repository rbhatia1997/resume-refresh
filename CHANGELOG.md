# Changelog

All notable changes to this project will be documented in this file.

Format: `MAJOR.MINOR.PATCH.MICRO`

---

## [0.1.1.5] - 2026-05-10

### Fixed

- **Experience headings are cleaned before preview/export** — the analyzer now strips duplicate inline date ranges before building the section editor and final preview.
- **PDF section rules no longer crowd headings** — section divider lines now sit below headings instead of crossing through them, and the extra header rule before Summary was removed from preview, PDF, and DOCX output.
- **Skills suggestions favor resume/LinkedIn evidence** — product skill cleanup now prioritizes supported, higher-signal skills and filters low-value process/tool terms like Jira and OKRs from suggested lists.

---

## [0.1.1.4] - 2026-05-10

### Fixed

- **Experience dates no longer duplicate in role titles** — if a role line contains more than one date-like range, the preview and exports strip dates out of the role text and keep the trailing date right-aligned.
- **Education dates stay in education text** — PDF and DOCX exports now apply right-aligned date formatting only to Experience rows, preventing education/projects lines from being misread as jobs.

---

## [0.1.1.3] - 2026-05-10

### Fixed

- **PDF and DOCX exports now match the final preview hierarchy** — exports use centered name/contact info, divider rules, bold experience roles, right-aligned dates, and compact skills like the review-flow preview.
- **Export page usage tightened** — PDF and DOCX margins/spacing were reduced so downloaded resumes use more of the page instead of looking undersized with excess whitespace.

---

## [0.1.1.2] - 2026-05-10

### Fixed

- **Final preview is editable again** — restored inline editing on the structured resume preview and export now serializes the edited preview so user changes are included in DOCX/PDF downloads.
- **Contact info no longer becomes the resume title** — pipe-separated headers like `Name | Location | Email | LinkedIn | Phone` now render the name as the H1 and move contact metadata to the smaller contact line.

---

## [0.1.1.1] - 2026-05-10

### Changed

- **Final resume preview now renders like a resume** — replaced the raw monospace final draft block with a structured preview that uses centered contact info, section rules, compact skills, and right-aligned experience dates on desktop.
- **Mobile final preview spacing tightened** — experience dates now collapse below role/company text on small screens so long date ranges do not crowd or overflow.

---

## [0.1.1.0] - 2026-04-06

### Fixed

- **Security headers now applied on all responses** — headers were silently dropped when `routes[]` was defined in `vercel.json`. Fixed by moving them into a `"continue": true` route entry. All 5 headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) now confirmed present in HTTP responses.
- **App no longer crashes on every request** — `TabStopLeader` was imported from the `docx` ESM package but doesn't exist as a named export. This caused a `SyntaxError` at module load time, making every API call return a Vercel 500. Removed the invalid import.
- **"Unexpected token A" JSON parse error in frontend** — when the server returns a plain-text 500 (e.g. `"A server error has occurred"`), `res.json()` was throwing instead of returning `{}`. Fixed with `.catch(() => ({}))` in `public/app.js`.
- **PDF/DOCX export formatting** — pipe-separated header fields were rendering as one blob, AI-wrapped bullet continuation lines were split across entries, and text was clipping mid-sentence. Now: header fields are split on ` | `, bullet continuations are merged back, and available page lines are pre-computed to prevent clipping.
- **Date alignment in PDF and DOCX exports** — job title dates (e.g. `Jan 2022 - Present`) were left-aligned inline. Now dates are right-aligned on the same baseline in PDF (computed from page width) and use `TabStopType.RIGHT` in DOCX.

---

## [0.1.0.0] - 2026-04-04

### Added

- Initial release: resume analysis and AI-powered rewrite via OpenAI or local Ollama
- PDF and DOCX export with section-aware parsing
- Rate limiting (20 req/hour), CORS, content-type validation
- Cost cap per request (4096 token output limit)
- 1-page PDF enforcement
