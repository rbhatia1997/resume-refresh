# Section-Level Resume Coach Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build section-level optional suggestion cards, photo resume parsing, stronger contact/summary/experience/skills/education coaching, and a shorter final review in the production `/` flow.

**Architecture:** Keep the production vanilla frontend as the user-facing target. Extract focused analyzer helpers for contact parsing, structured experience parsing, and section suggestion contracts, then render those suggestions as optional cards in `public/app.js`. Use the existing inference adapter boundary for OpenAI vision OCR and targeted AI suggestions so the app still works without an AI key for rule-based checks.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla JS frontend, OpenAI Responses API through `openai`, Playwright E2E, PDF/DOCX export through existing `pdf-lib` and `docx`.

---

## File Structure

- Create `src/contact-info.js`: contact field extraction and contact suggestion generation.
- Create `src/contact-info.test.js`: contact parsing and missing-field tests.
- Create `src/experience-entries.js`: structured role parsing, date/location splitting, bullet formatting, and metadata helpers moved out of `src/resume-analyzer.js`.
- Create `src/experience-entries.test.js`: structured experience parser and export-format tests.
- Create `src/section-suggestions.js`: section-level suggestion object builders for summary, experience, skills, education, and optional sections.
- Create `src/section-suggestions.test.js`: suggestion contract and section-specific behavior tests.
- Modify `src/resume-analyzer.js`: consume new helpers and return richer `sectionEditorData`.
- Modify `src/inference.js`: add configurable OpenAI model IDs and image OCR function.
- Modify `src/app.js`: accept image uploads, call image OCR, and preserve export parsing behavior.
- Modify `public/index.html`: accept image MIME/extensions and remove or demote old whole-resume AI action copy.
- Modify `public/app.js`: render editable original section text plus coach cards; implement `Apply`, `Edit`, and `Skip` for section suggestions.
- Modify `public/styles.css`: add responsive inline coach layout and compact suggestion card styles.
- Create `tests/e2e/section-coach.spec.js`: root `/` production-flow tests for section suggestions and final review.

## Task 1: Contact Parsing Contract

**Files:**
- Create: `src/contact-info.js`
- Create: `src/contact-info.test.js`
- Modify: `src/resume-analyzer.js`

- [ ] **Step 1: Write failing contact parsing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { extractContactInfo, buildContactSuggestions } from "./contact-info.js";

test("extractContactInfo detects name email phone location and URL from header lines", () => {
  const contact = extractContactInfo([
    "Jane Doe",
    "San Francisco, CA | jane@example.com | (415) 555-1212 | linkedin.com/in/janedoe"
  ]);

  assert.equal(contact.name, "Jane Doe");
  assert.equal(contact.email, "jane@example.com");
  assert.equal(contact.phone, "(415) 555-1212");
  assert.equal(contact.location, "San Francisco, CA");
  assert.equal(contact.links[0], "linkedin.com/in/janedoe");
});

test("buildContactSuggestions suggests missing required contact fields without blocking", () => {
  const suggestions = buildContactSuggestions({
    name: "Jane Doe",
    email: "",
    phone: "",
    location: "Oakland, CA",
    links: []
  });

  assert.deepEqual(suggestions.map((item) => item.id), ["contact-email-missing", "contact-phone-missing"]);
  assert.ok(suggestions.every((item) => item.applyMode === "insert-field"));
  assert.ok(suggestions.every((item) => item.severity !== "blocking"));
});
```

- [ ] **Step 2: Run contact tests to verify they fail**

Run: `node --test src/contact-info.test.js`

Expected: FAIL because `src/contact-info.js` does not exist.

- [ ] **Step 3: Implement minimal contact parser**

Implement `extractContactInfo(headerLines)` with regexes for email, phone, URL, and name. Implement `buildContactSuggestions(contact)` returning suggestion objects:

```js
{
  id: "contact-email-missing",
  type: "missing-field",
  severity: "high",
  title: "Email missing",
  detail: "Add an email address so recruiters can contact you.",
  originalText: "",
  suggestedText: "",
  rationale: "Contact info should include email, phone, and name.",
  applyMode: "insert-field",
  field: "email"
}
```

- [ ] **Step 4: Wire contact parser into analyzer**

In `src/resume-analyzer.js`, replace direct header-only name extraction where safe with `extractContactInfo(sections.header || [])`. Keep the existing `candidateName` output by using `contact.name`.

- [ ] **Step 5: Run contact tests**

Run: `node --test src/contact-info.test.js`

Expected: PASS.

## Task 2: Structured Experience Entries

**Files:**
- Create: `src/experience-entries.js`
- Create: `src/experience-entries.test.js`
- Modify: `src/resume-analyzer.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write failing structured experience tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseExperienceEntries, formatExperienceEntryHeading } from "./experience-entries.js";

test("parseExperienceEntries splits title company location and date range", () => {
  const entries = parseExperienceEntries([
    "IT Support Specialist - Example Retail, Northern California | 2022 - Present",
    "- Diagnose and resolve hardware and software issues",
    "- Install and maintain POS systems"
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "IT Support Specialist");
  assert.equal(entries[0].company, "Example Retail");
  assert.equal(entries[0].location, "Northern California");
  assert.equal(entries[0].dateRange, "2022 - Present");
  assert.deepEqual(entries[0].bullets, [
    "Diagnose and resolve hardware and software issues",
    "Install and maintain POS systems"
  ]);
});

test("formatExperienceEntryHeading emits role/company/location separate from date", () => {
  assert.equal(
    formatExperienceEntryHeading({
      title: "IT Support Specialist",
      company: "Example Retail",
      location: "Northern California",
      dateRange: "2022 - Present"
    }),
    "IT Support Specialist - Example Retail, Northern California 2022 - Present"
  );
});
```

- [ ] **Step 2: Run experience tests to verify they fail**

Run: `node --test src/experience-entries.test.js`

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Move existing parser logic into focused helper**

Move these existing concepts from `src/resume-analyzer.js` into `src/experience-entries.js`:

- `DATE_RANGE_RE`
- `isStandaloneDateLine`
- `looksLikeNewRoleStart`
- `parseExperienceEntries`
- `formatEntriesWithAnnotations`
- `formatExperienceWithAnnotations`

Preserve current exports used by analyzer, then extend entry shape with `title`, `company`, `location`, `dateRange`, `headerLines`, `bullets`, and `confidence`.

- [ ] **Step 4: Add heading parsing rules**

Handle these patterns in `parseExperienceEntries()`:

```text
Title - Company, Location | Date
Title, Company | Location | Date
Title | Company | Location | Date
Company
Title
Location
Date
```

Do not invent missing fields. Keep uncertain lines in `headerLines` and set confidence to `medium` or `low`.

- [ ] **Step 5: Update analyzer imports**

In `src/resume-analyzer.js`, import the helper exports and remove duplicated local definitions after tests are green. Keep behavior unchanged except structured metadata.

- [ ] **Step 6: Run relevant unit tests**

Run: `node --test src/experience-entries.test.js src/resume-analyzer.test.js`

Expected: PASS.

## Task 3: Education And Optional Section Parsing

**Files:**
- Modify: `src/resume-analyzer.js`
- Modify: `src/resume-analyzer.test.js`

- [ ] **Step 1: Write failing parser regression test**

Add to `src/resume-analyzer.test.js`:

```js
test("analyzeResume keeps projects and hobbies out of education", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

EDUCATION
City College
Associate Degree, Computer Science

PROJECTS
Home Lab Network
- Configured routers and POS-style peripherals

HOBBIES
Photography
`,
    targetRole: "IT Support Specialist"
  });

  const education = result.sectionEditorData.find((section) => section.id === "education");
  const projects = result.sectionEditorData.find((section) => section.id === "projects");

  assert.ok(education.currentText.includes("City College"));
  assert.doesNotMatch(education.currentText, /Home Lab|Photography/);
  assert.ok(projects.currentText.includes("Home Lab Network"));
});
```

- [ ] **Step 2: Run analyzer test to verify it fails or exposes current behavior**

Run: `node --test src/resume-analyzer.test.js`

Expected: FAIL if `HOBBIES` is absorbed or if projects are not surfaced in editor data.

- [ ] **Step 3: Extend section heading aliases conservatively**

Add `hobbies`, `interests`, `community`, and additional optional section aliases to `SECTION_HEADERS` and `SECTION_ALIASES` without mapping them to education.

- [ ] **Step 4: Update display labels and section order**

Add display labels and optional ordering for `interests`/`hobbies` only when content exists. Do not force these into final export unless approved in `SECTION_HEADERS` and export parser.

- [ ] **Step 5: Run analyzer tests**

Run: `node --test src/resume-analyzer.test.js`

Expected: PASS.

## Task 4: Section Suggestion Contract

**Files:**
- Create: `src/section-suggestions.js`
- Create: `src/section-suggestions.test.js`
- Modify: `src/resume-analyzer.js`

- [ ] **Step 1: Write failing suggestion contract tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildSummarySuggestions, buildExperienceSuggestions } from "./section-suggestions.js";

test("buildSummarySuggestions returns optional rewrite for generic summary", () => {
  const suggestions = buildSummarySuggestions({
    currentText: "Hardworking team player looking for a new opportunity.",
    targetRole: "IT Support Specialist",
    contact: { name: "Jane Doe" },
    candidateLevel: "early-career",
    skills: ["POS Systems", "Networking", "Hardware Support"]
  });

  assert.equal(suggestions[0].applyMode, "replace-section");
  assert.match(suggestions[0].suggestedText, /IT Support/i);
  assert.doesNotMatch(suggestions[0].suggestedText, /\bI\b|\bmy\b/i);
});

test("buildExperienceSuggestions returns concise per-bullet suggestions", () => {
  const suggestions = buildExperienceSuggestions({
    entries: [{
      title: "IT Support Specialist",
      company: "Example Retail",
      location: "Northern California",
      dateRange: "",
      bullets: ["Worked on installing equipment across store locations"]
    }]
  });

  assert.ok(suggestions.some((item) => item.id.includes("date")));
  assert.ok(suggestions.some((item) => item.applyMode === "replace-line"));
  assert.ok(suggestions.every((item) => !/unchanged/i.test(item.detail)));
});
```

- [ ] **Step 2: Run suggestion tests to verify they fail**

Run: `node --test src/section-suggestions.test.js`

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement rule-based suggestion builders**

Create builders for:

- `buildContactSuggestions(contact)` can be re-exported or consumed from `contact-info.js`
- `buildSummarySuggestions({ currentText, targetRole, candidateLevel, skills, recentTitle })`
- `buildExperienceSuggestions({ entries, bulletLint })`
- `buildSkillsSuggestions({ currentText, targetRole, supportingText })`
- `buildEducationSuggestions({ currentText })`

Every suggestion must include:

```js
{
  id,
  type,
  severity,
  title,
  detail,
  originalText,
  suggestedText,
  rationale,
  applyMode
}
```

- [ ] **Step 4: Integrate suggestions into section editor data**

In `buildSectionEditorData()`, replace or supplement `critique`/`changeLog` with `suggestions`. Preserve existing fields temporarily so the frontend can be migrated safely:

```js
{
  ...sectionResult,
  suggestions: sectionLevelSuggestions,
  parsedFields
}
```

- [ ] **Step 5: Run suggestion and analyzer tests**

Run: `node --test src/section-suggestions.test.js src/resume-analyzer.test.js`

Expected: PASS.

## Task 5: Image Resume Upload Backend

**Files:**
- Modify: `src/inference.js`
- Modify: `src/app.js`
- Create or modify: `src/app.test.js` if route-level tests are practical; otherwise add focused tests around exported helpers if helpers are extracted.

- [ ] **Step 1: Extract upload type helpers and write failing tests**

If `extractResumeText()` is not exported, extract `classifyResumeUpload({ fileName, mimeType })` into `src/app.js` or a new `src/resume-upload.js` with tests:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { classifyResumeUpload } from "./resume-upload.js";

test("classifyResumeUpload accepts supported image resume photos", () => {
  assert.equal(classifyResumeUpload({ fileName: "resume.jpg", mimeType: "image/jpeg" }).kind, "image");
  assert.equal(classifyResumeUpload({ fileName: "resume.png", mimeType: "image/png" }).kind, "image");
  assert.equal(classifyResumeUpload({ fileName: "resume.webp", mimeType: "image/webp" }).kind, "image");
});

test("classifyResumeUpload rejects unsupported uploads", () => {
  assert.throws(
    () => classifyResumeUpload({ fileName: "resume.heic", mimeType: "image/heic" }),
    /Unsupported file type/
  );
});
```

- [ ] **Step 2: Run upload tests to verify they fail**

Run: `node --test src/resume-upload.test.js`

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement upload classification**

Support:

- `.pdf` + `application/pdf`
- `.txt` + `text/plain`
- `.md` + markdown MIME variants
- `.jpg`/`.jpeg` + `image/jpeg`
- `.png` + `image/png`
- `.webp` + `image/webp`

Keep max upload size at the existing body limit unless explicitly changed.

- [ ] **Step 4: Add OpenAI vision OCR adapter**

In `src/inference.js`, export:

```js
export async function extractTextFromResumeImage({ imageBase64, mimeType }) {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_VISION_MODEL,
    max_output_tokens: 4096,
    temperature: 0,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Extract the resume text from this image. Preserve headings, line breaks, bullet markers, dates, email, phone, links, and names. Return plain text only." },
        { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "high" }
      ]
    }]
  });
  return response.output_text || "";
}
```

Use environment defaults:

```js
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;
```

If the configured provider is `ollama`, throw a clear `AppError` or regular error saying photo parsing requires OpenAI vision for now.

- [ ] **Step 5: Route image uploads through OCR**

In `extractResumeText()`, after decoding base64 and classifying type:

- PDF uses `pdf-parse`
- text/markdown decodes UTF-8
- image calls `extractTextFromResumeImage`

Pass `resumeFileType` from the frontend when available, but do not trust it alone. Classify by extension and MIME.

- [ ] **Step 6: Run upload tests and app smoke tests**

Run: `node --test src/resume-upload.test.js src/resume-analyzer.test.js`

Expected: PASS.

## Task 6: Frontend Upload Acceptance

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add E2E test for image file acceptance UI**

In `tests/e2e/section-coach.spec.js`, add:

```js
import { expect, test } from "@playwright/test";

test("root upload accepts resume photo file types", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#resume-file");
  await expect(input).toHaveAttribute("accept", /jpg|jpeg|png|webp/);
});
```

- [ ] **Step 2: Run E2E test to verify it fails**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "photo file types"`

Expected: FAIL until the accept attribute is updated.

- [ ] **Step 3: Update upload accept list and validation**

In `public/index.html`, update:

```html
accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
```

In `public/app.js`, update `applyFile()` to allow image extensions and MIME types, and include:

```js
payload.resumeFileType = file.type || inferMimeFromFileName(file.name);
```

- [ ] **Step 4: Update file status copy**

Change upload hints from `PDF, TXT, or MD` to `PDF, TXT, MD, or resume photo`.

- [ ] **Step 5: Re-run E2E test**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "photo file types"`

Expected: PASS.

## Task 7: Inline Coach Frontend Renderer

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `public/index.html`

- [ ] **Step 1: Add E2E test for section suggestion cards**

Add to `tests/e2e/section-coach.spec.js`:

```js
test("root flow shows optional contact suggestions without blocking continue", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe

SUMMARY
Hardworking team player looking for a job.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California
- Worked on installing equipment across store locations
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await expect(page.getByRole("heading", { name: "Contact Info" })).toBeVisible();
  await expect(page.getByText("Email missing")).toBeVisible();
  await expect(page.getByText("Phone missing")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Professional Summary" })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify it fails**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "contact suggestions"`

Expected: FAIL because suggestions are not rendered as cards.

- [ ] **Step 3: Change section panel render structure**

In `renderSectionPanel(section)`:

- render `section.currentText` in the textarea
- use `section.proposedText` only as fallback for missing sections
- create a `.section-workspace` with `.section-editor-column` and `.section-coach-column`
- render `section.suggestions` into `.suggestion-card` elements

- [ ] **Step 4: Implement apply/edit/skip modes**

Add frontend state:

```js
skippedSuggestions: {}
editingSuggestionId: null
```

Implement:

- `replace-section`: set textarea to `suggestedText`
- `replace-line`: replace first exact `originalText` match in textarea with `suggestedText`
- `insert-field`: append a placeholder line like `Email: ` or focus a small input inside the card
- `informational`: no apply button
- `Skip`: hide card for current render/session
- `Edit`: copy `suggestedText` into an editable mini textarea before applying

- [ ] **Step 5: Keep backward compatibility**

If a section lacks `suggestions`, render the existing critique bar and change log until all backend tasks are complete. Remove fallback only after E2E is green.

- [ ] **Step 6: Add responsive CSS**

Add styles:

```css
.section-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; padding: 18px 24px; }
.section-coach-column { display: grid; gap: 10px; align-content: start; }
.suggestion-card { border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); padding: 12px 14px; }
.suggestion-card-title { font-size: .875rem; font-weight: 700; }
.suggestion-card-detail, .suggestion-card-rationale { font-size: .8125rem; color: var(--muted); line-height: 1.5; }
.suggestion-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
@media (max-width: 760px) { .section-workspace { grid-template-columns: 1fr; padding: 14px 18px; } }
```

- [ ] **Step 7: Re-run E2E test**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "contact suggestions"`

Expected: PASS.

## Task 8: Summary And Bullet Apply UX

**Files:**
- Modify: `src/section-suggestions.js`
- Modify: `public/app.js`
- Modify: `tests/e2e/section-coach.spec.js`

- [ ] **Step 1: Add E2E tests for applying summary and bullet suggestions**

```js
test("summary and bullet suggestions can be applied without replacing unrelated sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
Hardworking team player looking for a job.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California
- Worked on installing equipment across store locations
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Suggested summary rewrite")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.locator("#section-textarea")).toContainText("IT Support");

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Replace weak opener")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.locator("#section-textarea")).not.toContainText("Worked on installing");
  await expect(page.locator("#section-textarea")).toContainText("Installed");
});
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "summary and bullet"`

Expected: FAIL until suggestions and apply behavior exist.

- [ ] **Step 3: Tune summary suggestions**

Make `buildSummarySuggestions()` generate a deterministic rule-based suggested summary from:

- target role
- inferred/recent title
- candidate level
- normalized skills
- current experience domain

Do not call AI in this first pass unless the model is configured and the call is already available through the adapter. Rule-based output must pass tests.

- [ ] **Step 4: Tune bullet suggestions**

For each changed bullet, emit one suggestion card. Use existing `strengthenBullet()` behavior for deterministic suggestions, but improve card labels:

- `Replace weak opener`
- `Use consistent tense`
- `Add scope or result`
- `Tighten long bullet`

- [ ] **Step 5: Re-run E2E**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "summary and bullet"`

Expected: PASS.

## Task 9: Skills Presentation

**Files:**
- Modify: `src/section-suggestions.js`
- Modify: `src/skills-grounding.js` if canonical casing gaps are found
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add unit test for skills suggestion copy and casing**

Add to `src/section-suggestions.test.js`:

```js
test("skills suggestions use canonical casing and readable copy", () => {
  const suggestions = buildSkillsSuggestions({
    currentText: "COMMUNICATION\nsql\nrandom problem solving",
    targetRole: "IT Support Specialist",
    supportingText: "POS systems, networking, hardware troubleshooting"
  });

  assert.doesNotMatch(JSON.stringify(suggestions), /RANDOM PROBLEM SOLVING|COMMUNICATION/);
  assert.ok(suggestions.some((item) => /SQL|POS|Networking|Hardware/i.test(item.suggestedText)));
});
```

- [ ] **Step 2: Run unit test to verify it fails**

Run: `node --test src/section-suggestions.test.js`

Expected: FAIL if current copy leaks all caps or does not suggest normalized skills.

- [ ] **Step 3: Render skills suggestions as chips**

In frontend suggestion renderer, when `suggestion.type === "skills-list"`, show `suggestedText` split by newline or pipe as `.skill-chip` elements.

- [ ] **Step 4: Add CSS for skill chips**

Use restrained chips:

```css
.skill-chip-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.skill-chip { border: 1px solid var(--border); border-radius: 999px; padding: 4px 8px; font-size: .75rem; background: var(--bg); }
```

- [ ] **Step 5: Run unit tests**

Run: `node --test src/section-suggestions.test.js src/skills-grounding.test.js`

Expected: PASS.

## Task 10: Final Review Cleanup

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `tests/e2e/section-coach.spec.js`

- [ ] **Step 1: Add E2E test that old AI action wall is not primary**

```js
test("final review is short and does not lead with old whole-resume action grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California | 2022 - Present
- Diagnosed and resolved hardware and software issues for retail store systems.

SKILLS
POS Systems
Networking
Hardware Support
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }

  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  await expect(page.getByText("Tighten wording")).toHaveCount(0);
  await expect(page.getByText("Improve ATS match")).toHaveCount(0);
});
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "final review"`

Expected: FAIL until old grid is removed or hidden.

- [ ] **Step 3: Remove or demote old AI block**

Remove the `Refine this draft` action grid from `public/index.html`, or move it behind a collapsed advanced disclosure labeled `Run whole-resume pass`.

Recommendation: remove for this pass to keep UX focused.

- [ ] **Step 4: Simplify final notes**

Render only unresolved high-priority suggestions from `analysisResult.suggestions`, capped at 3-4 cards. If none remain, show `No major issues detected.`

- [ ] **Step 5: Re-run E2E**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js -g "final review"`

Expected: PASS.

## Task 11: Export Date Formatting Regression

**Files:**
- Modify: `src/app.js`
- Modify or create: `src/export-format.test.js`

- [ ] **Step 1: Extract export parsing helpers if needed**

If `parseResumeForExport()` and `splitJobDate()` remain private inside `src/app.js`, either export them under test-safe names or move them to `src/export-format.js`.

- [ ] **Step 2: Write failing date split test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { splitJobDate } from "./export-format.js";

test("splitJobDate supports role company location with trailing year range", () => {
  assert.deepEqual(
    splitJobDate("IT Support Specialist - Example Retail, Northern California 2022 - Present"),
    {
      role: "IT Support Specialist - Example Retail, Northern California",
      date: "2022 - Present"
    }
  );
});
```

- [ ] **Step 3: Run export test to verify it fails**

Run: `node --test src/export-format.test.js`

Expected: FAIL if year-only ranges are not split.

- [ ] **Step 4: Extend date range regex**

Support both month-year ranges and year-only ranges:

```js
\b(?:19|20)\d{2}\s*[-–—]\s*(?:Present|Current|Now|(?:19|20)\d{2})\b
```

Keep bullet lines excluded.

- [ ] **Step 5: Run export tests**

Run: `node --test src/export-format.test.js`

Expected: PASS.

## Task 12: Full Verification

**Files:**
- All modified files

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: PASS with no warnings that indicate broken assertions.

- [ ] **Step 2: Start local server**

Run: `PORT=3210 npm start`

Expected: server logs `Resume Refresh running at http://127.0.0.1:3210`. If port is occupied, use `PORT=3216 npm start` and adjust `E2E_BASE_URL`.

- [ ] **Step 3: Run production-flow E2E tests**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e/section-coach.spec.js`

Expected: PASS.

- [ ] **Step 4: Run existing E2E tests if time allows**

Run: `E2E_BASE_URL=http://127.0.0.1:3210 npm run test:e2e`

Expected: PASS.

- [ ] **Step 5: Browser QA**

Open `http://127.0.0.1:3210` and verify:

- photo upload copy appears
- contact suggestions are optional
- summary suggestion appears beside editor
- bullet suggestion applies only the targeted line
- skills suggestions are readable and title-cased
- final review is short
- DOCX/PDF export still works

- [ ] **Step 6: Commit implementation**

Run:

```bash
git add src public tests package.json package-lock.json
git commit -m "feat: add section-level resume coaching"
```

Expected: commit succeeds with only intentional files staged.
