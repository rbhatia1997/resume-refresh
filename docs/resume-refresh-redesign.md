# Resume Refresh Redesign

## 1. UX Strategy

### Product promise
Resume Refresh should feel like a calm career coach, not a form-heavy editor. The product promise is simple: bring in what you already have, improve it fast, and leave with a stronger resume.

### Primary user anxieties
- "My resume is probably weak, but I don't know where."
- "I don't want to start from scratch."
- "I don't trust AI to make things up."
- "I don't know what LinkedIn import will do."
- "I don't want to lose control of my wording."

### UX principles
- Reduce decision load: show one meaningful next action at a time.
- Explain automation before using it: imports and rewrites must feel visible and reversible.
- Make progress legible: users should always know where they are and what remains.
- Keep editing approachable: generated text should feel editable, not precious.
- Earn trust continuously: use plain language, visible source mapping, and no black-box moments.

### Conversion strategy
- Landing page should sell relief, not features.
- Primary CTA should start with a low-friction choice: `Import from LinkedIn` or `Start manually`.
- Onboarding should reach a first draft fast.
- Builder should surface visible improvement quickly: weak bullet -> stronger bullet.
- Export should feel like completion, not an afterthought.

## 2. User Flow

1. Landing page
2. Start flow
3. Choose source path
4. Import permissions or manual setup
5. Review imported data
6. Fill missing fields
7. Builder workspace
8. Rewrite and tighten bullets
9. Review live resume preview
10. Export

### Happy path
Landing -> LinkedIn import -> permissions -> import review -> fill gaps -> builder -> generate stronger bullets -> export

### Low-friction manual path
Landing -> start manually -> role + experience basics -> builder -> preview -> export

## 3. Page List

1. Landing
2. Source choice
3. Import permissions
4. Import review
5. Builder
6. Export

## 4. Wireframe Descriptions

### Landing
- Clean hero with one clear value proposition.
- Primary CTA: `Refresh my resume`
- Secondary CTA: `See example`
- Trust section: what import does and does not pull.
- Feature strip: build, refresh, tailor, export.
- Resume example preview.
- Social proof placeholders.
- FAQ.

### Source Choice
- Centered card, not dashboard layout.
- Two large options:
  - `Import profile`
  - `Start manually`
- One sentence under each explaining effort and outcome.

### Import Permissions
- Explain exactly what will be imported:
  - basic profile identity
  - pasted/exported profile text
  - uploaded resume
- Explain what will not happen:
  - no posting
  - no changes to LinkedIn
  - user confirms before anything is used
- Primary CTA: `Continue import`
- Secondary CTA: `Start manually instead`

### Import Review
- Imported sections listed as editable cards:
  - Header
  - Experience
  - Skills
  - Education
- Missing fields highlighted with light warnings and inline fill prompts.
- Each section has `Keep`, `Edit`, `Skip`.

### Builder
- One focused editing column plus one live preview column.
- Top toolbar:
  - role selector
  - tone selector
  - fit score
- Main editing modules:
  - summary
  - experience blocks
  - bullet rewrite suggestions
  - before/after cards
- Live preview should update in place.

### Export
- Final confidence screen:
  - readiness summary
  - what improved
  - export formats
- CTAs:
  - `Download PDF`
  - `Download DOCX`
  - `Keep editing`

## 5. Component Hierarchy

- `ResumeRefreshApp`
  - `LandingPage`
    - `Hero`
    - `TrustStrip`
    - `FeatureGrid`
    - `ExamplePreview`
    - `Testimonials`
    - `FaqList`
    - `FinalCta`
  - `WorkflowShell`
    - `ProgressHeader`
    - `SourceChoiceStep`
    - `ImportPermissionStep`
    - `ImportReviewStep`
      - `ImportSectionCard`
      - `MissingFieldCallout`
    - `BuilderStep`
      - `BuilderToolbar`
      - `SectionNavigator`
      - `EditableSectionCard`
      - `RewriteSuggestionCard`
      - `BeforeAfterCard`
      - `LiveResumePreview`
    - `ExportStep`
      - `ReadinessSummary`
      - `ExportCard`

## 6. Visual Design Direction

### Tone
- Premium, quiet, sharp.
- Warm neutrals instead of cold enterprise UI.
- High contrast for clarity, soft surfaces for trust.

### References
- Linear: precision, hierarchy, restraint.
- Stripe: guided conversion and polished information density.
- Notion: calm editing surfaces.
- Modern AI tools: helpful automation without mystery.

### Style system
- Background: warm off-white with subtle depth.
- Panels: soft white with thin neutral borders.
- Accent: deep ink + restrained amber/copper highlight.
- Typography:
  - display: editorial, elegant
  - body: clean sans
  - meta labels: mono
- Layout:
  - narrow content width
  - strong spacing rhythm
  - one dominant action per screen

## 7. Copy Suggestions

### Landing hero
- Headline: `Turn your experience into a stronger resume.`
- Subheadline: `Import what you already have, fix what is weak, and leave with a cleaner, sharper resume.`
- Primary CTA: `Refresh my resume`
- Secondary CTA: `View sample resume`

### Source choice
- Title: `How do you want to start?`
- Import option: `Bring in what you already have`
- Import helper: `Use LinkedIn and your current resume as a shortcut. You will review everything before it is used.`
- Manual option: `Build it step by step`
- Manual helper: `Answer guided prompts and create a resume from scratch or from memory.`

### Import permissions
- Title: `Review what Resume Refresh will use`
- Copy: `We only use the information you choose to bring in. Nothing is posted, changed, or shared.`

### Builder
- Title: `Make each section stronger`
- Helper: `Focus on impact, ownership, and clarity. Edit anything manually.`

### Rewrite controls
- Concise: `Tighter and cleaner`
- Balanced: `Clear and natural`
- Achievement-focused: `More impact-forward`

### Export
- Title: `Your refreshed resume is ready`
- Helper: `Download it now, or make a few final edits first.`
