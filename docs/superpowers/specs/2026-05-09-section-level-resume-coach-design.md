# Section-Level Resume Coach Design

## Goal

Turn the current production `/` flow into a guided resume coach that gives useful, optional suggestions while the user edits each section, rather than waiting until final review to show long AI notes or full-document rewrite actions.

The user should feel in control: Resume Refresh parses what they uploaded, shows what it found, suggests concrete fixes, and lets them apply, edit, or skip every suggestion.

## Product Decisions

- Keep the production `/` vanilla frontend as the target for this pass.
- Use `/v2.html` only as a reference for interaction ideas and visual polish.
- Keep original parsed section text in the editor. Do not silently pre-fill the editor with rewritten text.
- Render suggestions as compact section-level cards beside or below the editor.
- Use OpenAI vision for photographed resumes when an AI provider is configured. If not configured, keep PDF/TXT/MD working and explain that photo parsing requires AI.
- Do not store resume text or uploaded files server-side.

## Current Problems

The current app has good visual direction, but the improvement loop is late and verbose:

- The final `Refine this draft` action grid duplicates work that should happen inside each section.
- AI notes can become long and difficult to scan.
- Summary rewrites often preserve the parsed text too closely and do not use enough target-role context.
- Bullet improvements focus on formatting and weak-opener cleanup but do not feel like a full resume-quality review.
- Skills suggestions can look noisy or inconsistent.
- Education parsing can absorb unrelated sections such as projects or hobbies.
- Experience metadata is not structured enough to reliably render title, company, location, and right-aligned dates.
- Contact info is not coached as a first-class section.

## Target Experience

### Intake

The upload control accepts:

- PDF
- TXT
- MD
- JPG/JPEG
- PNG
- WEBP

PDF/TXT/MD continue through the existing text extraction path. Image files go through an AI vision extraction path that returns plain resume text. If no AI provider is configured, the upload UI accepts the file but the server returns a clear error: photo parsing requires a configured AI provider.

The target-role field remains required because summary and bullet guidance should be tailored to what the user is trying to achieve.

### Section Editor

Each section step uses the same interaction model:

1. Show the section title and status.
2. Show the parsed original text in an editable textarea.
3. Show a right-side or below-editor coach panel with section-specific suggestions.
4. Each suggestion card includes:
   - issue label
   - short explanation
   - suggested replacement or next action
   - `Apply`, `Edit`, and `Skip` controls when a concrete change exists
5. Continuing saves the current textarea value, including any applied or manually edited suggestions.

The app should not require users to accept every suggestion. Suggestions are advisory, not blocking.

### Contact Info

Contact info becomes a real first step.

The analyzer extracts:

- name
- email
- phone
- location
- LinkedIn or portfolio URL when present

The coach suggests missing name, email, or phone. Missing location or LinkedIn can be low-priority suggestions, not required.

Example cards:

- `Email missing`: Add an email address so recruiters can contact you.
- `Phone missing`: Add a phone number if this resume is for direct applications.
- `Name unclear`: We could not confidently detect your full name.

### Summary

The summary step should stop treating the current summary as the proposed rewrite.

Behavior:

- Keep the parsed summary in the editor.
- Analyze it against target role, candidate level, experience, skills, and LinkedIn support text.
- Show a suggested summary rewrite card when the current summary is missing, generic, too short, first-person, too broad, or not aligned to the target role.
- Do not invent achievements, titles, companies, dates, or metrics.

The summary rewrite should be 2-3 concise lines and should express:

- current or target professional identity
- most relevant domain/scope
- 2-4 grounded strengths or tools
- target direction when useful

### Experience

The experience parser should produce structured entries:

```js
{
  title: "IT Support Specialist",
  company: "Safeway",
  location: "Northern California",
  dateRange: "2022 - Present",
  bullets: [...]
}
```

The editor can still store plain text, but the analyzer should preserve this metadata internally so export can format entries as:

```text
Position - Company, Location                          Date range
```

The coach checks each bullet for:

- verb tense consistency
- weak openers
- first-person language
- missing measurable or observable outcome
- vague scope
- excessive length
- repeated wording
- low-signal task phrasing

Suggestion cards should be concise. For a changed bullet, show one before/after pair and one reason, not a long list of every unchanged bullet.

Example:

```text
Issue: Add scope
Before: Install, replace, configure, and maintain IT equipment across store locations.
After: Configured and maintained POS, printer, handheld, and network equipment across Northern California Safeway locations.
Why: Makes the environment and equipment scope clearer without inventing metrics.
```

### Skills

Skills should be presented in clean title case, grouped or chipped where useful, and never as random all-caps prose.

The coach should:

- normalize recognized skills to canonical casing
- flag generic traits like `Communication` only when they are not meaningful for the target role
- suggest role-relevant skills only when they are supported by resume or LinkedIn text
- avoid keyword stuffing

Cards can offer `Trim weak skills` and `Align to target role`, but the preview must be short and readable.

### Education And Nontraditional Sections

Section parsing should be more conservative:

- `Projects`, `Hobbies`, `Interests`, `Volunteer`, `Certifications`, and `Awards` must not be absorbed into Education.
- If a nontraditional section is detected, keep it as an optional section and include it in the guided flow only when it has content.
- Education should expect school, degree, field, and date/year when present, but should not block if the user intentionally omits education.

### Final Review

Final review should become a short readiness check and export step.

It should include:

- unresolved high-priority issues only
- ATS-safe structure checks
- final editable resume preview
- PDF/DOCX export buttons

It should not show the old full action grid as the primary improvement surface. Section-level suggestions replace that pattern.

## Backend Design

### Text Extraction

`src/app.js` should extend `extractResumeText()` to recognize image extensions and image MIME types.

Image extraction uses a new inference adapter function, for example:

```js
extractTextFromResumeImage({ imageBase64, mimeType })
```

That function calls the Responses API with one image input and asks for plain extracted resume text only. The prompt should instruct the model to preserve line breaks, headings, bullet markers, dates, and contact information.

Official OpenAI docs indicate that current models support image input and that the Responses API can analyze base64 image inputs. The implementation should use the current configured OpenAI model that supports vision, with a cost-conscious default.

### Inference Adapter

`src/inference.js` should own all model-specific behavior:

- full resume action rewrites
- image OCR extraction
- section coaching JSON

Model IDs should be configurable with sane defaults:

- `OPENAI_MODEL` for text/section coaching
- `OPENAI_VISION_MODEL` for image parsing, defaulting to the text model when compatible

The current hard-coded `gpt-4.1-mini` can be upgraded as part of this work if the app is already using OpenAI and the API surface remains compatible.

### Section Coaching Data

`analyzeResume()` should return richer `sectionEditorData`.

Each section should include:

```js
{
  id,
  label,
  status,
  currentText,
  parsedFields,
  suggestions: [
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
  ],
  parseWarning
}
```

`applyMode` can be:

- `replace-section`
- `replace-line`
- `insert-field`
- `informational`

The frontend can implement only the needed modes first.

### AI Section Suggestions

The first implementation should keep most checks rule-based, then add AI where it provides obvious value:

- image OCR
- summary rewrite
- bullet rewrite suggestions

This keeps the app useful without API keys and makes AI calls targeted when keys exist.

## Frontend Design

`public/app.js` should change the section renderer from:

- current content block
- critique bar
- pre-filled suggested rewrite textarea
- long change log

to:

- editable parsed section textarea
- coach panel with suggestion cards
- optional before/after cards
- simple apply/edit/skip controls

For desktop, use a two-column section panel when space allows:

- left: editor
- right: coach

For mobile, stack editor first and coach second.

The final action grid in final review should be removed or visually demoted. If retained for advanced users, it should sit behind a secondary `Run whole-resume pass` disclosure after the section workflow.

## Testing

Unit tests should cover:

- image upload type acceptance and clear provider-required error
- contact field extraction and missing-field suggestions
- summary suggestions when summary is generic or unchanged
- bullet suggestion objects for tense, quantification, scope, and concision
- projects/hobbies not being parsed into education
- structured experience metadata and right-aligned date export parsing
- skill canonical casing and suggestion copy

E2E tests should cover:

- uploading or pasting a resume reaches the contact step
- missing phone/email suggestions appear but do not block continuing
- summary suggestion can be applied and edited
- experience suggestion card applies a bullet change without replacing the whole section
- final review no longer shows the old long AI action wall as the main improvement flow

## Rollout Notes

This is a production-flow change, not a parallel rewrite. Keep changes scoped to:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `src/app.js`
- `src/inference.js`
- `src/resume-analyzer.js`
- related tests

Avoid expanding the landing page or migrating to React in this pass.

## Open Questions

- Whether to keep whole-resume AI passes behind an advanced disclosure or remove them entirely.
- Whether to require phone in contact info for all users or keep it as a suggestion only.
- Whether to surface image upload privacy copy in the intake card or only on AI-required errors.
