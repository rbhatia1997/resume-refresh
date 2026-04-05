# V2 Landing Refactor Design

## Goal

Refactor `/v2.html` so it feels like a production-grade SaaS landing page rather than a generated mockup. The page should inform a new user quickly, demonstrate one clear proof point, and drive a single conversion action: `Start Resume Refresh`.

## Current Problems

- The hero is oversized and over-padded, which makes the page feel more like a concept board than a product surface.
- Multiple cards compete for attention at the same hierarchy level, so the primary message does not dominate the fold.
- Accent treatments are scattered across pills, surfaces, and status badges, which adds noise.
- Visual framing relies too much on decorative containers instead of information hierarchy.
- Typography scale is too loose and inconsistent for a disciplined landing page.

## Target Outcome

The page should feel:

- dense but calm
- fast to scan
- professionally spaced
- visually restrained
- built around one clear action

Reference qualities:

- Linear: dense, crisp, minimal clutter
- Stripe Dashboard: strong hierarchy and spacing discipline
- Ramp: practical card layout and readable information blocks
- Notion Calendar: restrained typography and low-noise surfaces

## Scope

In scope:

- Refactor the `/v2.html` landing experience and its React/Tailwind implementation
- Tighten layout, spacing, typography, borders, buttons, and proof presentation
- Keep the page responsive

Out of scope:

- Expanding the page into a multi-section marketing site
- Adding charts, testimonial carousels, decorative gradients, or new feature modules
- Redesigning the underlying in-product workflow beyond its entry point

## Layout

### Overall structure

Use a compact product landing layout with two sections only:

1. Hero
2. Lightweight proof strip

### Hero

Desktop:

- Two-column grid
- Left column for message and CTA
- Right column for one compact before/after rewrite proof card

Mobile:

- Single-column stack
- Message first
- Proof card second

Hero content order:

1. Product eyebrow
2. Headline
3. One short supporting paragraph
4. Primary CTA
5. Quiet secondary action

### Proof strip

One compact horizontal strip under the hero with three equally weighted proof items:

- import existing material
- strengthen weak bullets
- export a cleaner draft

This strip should read as product proof, not as large standalone cards.

## Information Hierarchy

The fold should prioritize:

1. What the product does
2. Why it is credible
3. What to do next

The hero headline and primary CTA must dominate. The proof card supports the claim but should not visually overpower the core message.

## Typography

Use a restrained type scale with no more than four levels:

- Hero title
- Section/proof title
- Body text
- Metadata/eyebrow text

Rules:

- Tight, intentional headline leading
- Body copy kept short and readable
- Metadata consistently uppercase or compact label styling, but not overused
- Avoid multiple near-duplicate font sizes

## Spacing System

Adopt a consistent spacing rhythm based on:

- 4
- 8
- 12
- 16
- 24
- 32

Rules:

- Reduce oversized padding in the hero shell and cards
- Keep vertical rhythm tighter than the current version
- Align all related elements to a shared spacing cadence

## Visual System

### Color

- Neutral backgrounds and white surfaces
- One accent color only
- Accent reserved for the primary CTA and selective proof emphasis

### Surfaces

- Prefer subtle borders over heavy shadows
- Minimal shadow, only if needed for separation
- No decorative glow or gradient-heavy framing

### Radius

- Use one consistent radius family across cards, buttons, and containers
- Avoid oversized rounded corners

## Components

### Primary CTA

- One clear, visually dominant button style
- Consistent height, padding, and label alignment

### Secondary action

- Quiet button or text-style control
- Clearly subordinate to the primary CTA

### Proof card

- Designed like a real product card
- Dense internal spacing
- Strong labels for `Before` and `After`
- Clean comparison layout with consistent borders and typography

### Proof strip items

- Compact, aligned, and low-noise
- No oversized icon containers
- If icons are used, they must be minimal and consistent

## Responsiveness

Requirements:

- Collapse hero grid cleanly on smaller screens
- Maintain hierarchy without oversized stacked cards
- Keep CTA accessible and prominent on mobile
- Avoid decorative overflow or dead space

## Anti-Goals

The implementation must avoid:

- giant empty hero sections
- oversized rounded cards everywhere
- multiple accent colors
- random gradients or glows
- inconsistent button styles
- weak card hierarchy
- fake dashboard filler
- floating decorative elements with no purpose

## Implementation Notes

- Refactor the React prototype source first, then rebuild the generated `public/v2` assets
- Keep changes localized to the landing surface and shared primitives it uses
- Favor cleaner component composition if current sections are too large or mixed in responsibility

## Verification

Before completion:

- Rebuild `public/v2/app.js` and `public/v2/app.css`
- Run the relevant automated tests if they cover the landing page
- Capture a fresh local screenshot of `/v2.html`
- Confirm the final page matches the approved structure:
  - compact two-column hero
  - one before/after proof card
  - one lightweight proof strip
  - one clear primary CTA
