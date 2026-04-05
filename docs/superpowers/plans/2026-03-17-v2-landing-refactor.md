# V2 Landing Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/v2.html` into a compact, production-grade landing page with one strong CTA, one proof card, and one lightweight proof strip.

**Architecture:** Keep the change localized to the existing React prototype landing stage in `prototype/ResumeRefreshPrototype.tsx`, then rebuild the generated `public/v2` bundle so the served app matches the source. Preserve the existing workflow stage transitions and sample/start interactions while replacing the landing composition, spacing, and component styling with a tighter system.

**Tech Stack:** React 19, Tailwind CSS v4, esbuild, Playwright

---

### File Map

**Primary files:**
- Modify: `prototype/ResumeRefreshPrototype.tsx`
- Modify: `prototype/tailwind.css` only if the landing needs small base-level adjustments shared across the page
- Regenerate: `public/v2/app.js`
- Regenerate: `public/v2/app.css`
- Verify: `tests/e2e/v2.spec.js`

**Responsibilities:**
- `prototype/ResumeRefreshPrototype.tsx`: landing-stage layout, content hierarchy, proof strip, CTA styling, and any landing-only helper components/constants
- `prototype/tailwind.css`: only shared base styling if required for the tighter product shell
- `tests/e2e/v2.spec.js`: existing landing visibility and breakpoint checks that protect the refactor

### Task 1: Lock Landing Test Coverage

**Files:**
- Modify: `tests/e2e/v2.spec.js`
- Reference: `prototype/ResumeRefreshPrototype.tsx`

- [ ] **Step 1: Add or tighten landing assertions around the approved structure**

Add assertions that the landing still exposes:
- `Start Resume Refresh`
- `View sample`
- one visible proof module title
- the three lightweight proof strip items

Prefer extending the existing landing breakpoint test instead of adding a second overlapping test.

- [ ] **Step 2: Run the focused landing test to verify the new assertions fail or are pending current structure**

Run: `npx playwright test tests/e2e/v2.spec.js -g "landing CTA and layout stay intact across target breakpoints"`

Expected: either FAIL because the new strings/structure are not present yet, or PASS only if the assertions are too weak and need tightening.

- [ ] **Step 3: Adjust assertions until they meaningfully protect the intended redesign**

Keep the test focused on user-visible structure, not Tailwind classes.

- [ ] **Step 4: Re-run the focused landing test**

Run: `npx playwright test tests/e2e/v2.spec.js -g "landing CTA and layout stay intact across target breakpoints"`

Expected: FAIL before implementation.

### Task 2: Refactor the Landing Composition

**Files:**
- Modify: `prototype/ResumeRefreshPrototype.tsx`

- [ ] **Step 1: Simplify landing-only data and remove unused marketing sections**

Delete or stop rendering the extra post-hero sections and any landing-only arrays/constants that no longer belong:
- `featureCards`
- `workflowSteps`
- `trustPoints`
- oversized sample-resume pairing in the hero if it no longer fits the approved structure

Retain only the data required for:
- hero content
- before/after proof card
- lightweight proof strip

- [ ] **Step 2: Refactor the hero into a compact two-column product landing**

Implement:
- restrained page shell
- left content rail with eyebrow, headline, short paragraph, primary CTA, secondary action
- right compact before/after proof card

Requirements:
- tighter spacing cadence
- neutral surfaces
- one accent color
- subtle borders over heavy shadows
- consistent button heights and radii

- [ ] **Step 3: Add the lightweight proof strip below the hero**

Render three compact proof items with equal visual weight:
- import existing material
- strengthen weak bullets
- export a cleaner draft

Keep this as a low-noise strip, not three large feature cards.

- [ ] **Step 4: Tighten landing typography and component styling**

In the landing markup:
- reduce font-size sprawl
- standardize metadata styling
- remove oversized pills/shadows/radii
- keep one dominant action and one subdued secondary action

Only touch `prototype/tailwind.css` if a shared base adjustment is necessary.

### Task 3: Rebuild Generated Assets

**Files:**
- Regenerate: `public/v2/app.js`
- Regenerate: `public/v2/app.css`

- [ ] **Step 1: Rebuild the JS bundle**

Run: `npm run build:v2:js`

Expected: build succeeds and updates `public/v2/app.js`

- [ ] **Step 2: Rebuild the CSS bundle**

Run: `npm run build:v2:css`

Expected: build succeeds and updates `public/v2/app.css`

- [ ] **Step 3: Smoke-check the served page**

Run: `curl -sS http://127.0.0.1:3210/v2.html`

Expected: page still serves successfully with the same entrypoint.

### Task 4: Verify the Refactor

**Files:**
- Verify: `tests/e2e/v2.spec.js`

- [ ] **Step 1: Run the focused landing tests**

Run: `npx playwright test tests/e2e/v2.spec.js -g "landing CTA and layout stay intact across target breakpoints|mobile landing and builder do not introduce obvious horizontal overflow"`

Expected: PASS

- [ ] **Step 2: Capture a fresh landing screenshot**

Run: `npx playwright screenshot http://127.0.0.1:3210/v2.html /tmp/resume-refresh-v2-refactor.png`

Expected: screenshot created successfully

- [ ] **Step 3: Review the screenshot against the spec**

Confirm:
- compact hero
- one proof card
- one proof strip
- one clear primary CTA
- reduced visual noise

- [ ] **Step 4: Review git diff for accidental spillover**

Run: `git diff -- prototype/ResumeRefreshPrototype.tsx prototype/tailwind.css public/v2/app.js public/v2/app.css tests/e2e/v2.spec.js`

Expected: only the landing refactor, generated bundle updates, and related test changes appear.
