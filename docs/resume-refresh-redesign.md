# Resume Refresh Product Notes

This document is a lightweight public-facing summary of the current product direction.

## Product Goal

Resume Refresh should feel like a calm, guided resume coach:

- import what you already have
- clean and structure it
- review one section at a time
- use AI only when it is helpful and clearly scoped
- finish with a recruiter-readable, ATS-safer resume

## Current User Flow

1. Landing page
2. Choose how to start
3. Upload a resume or paste profile/resume text
4. Review parsed sections in order
5. Create the first draft
6. Edit sections in a guided sequence:
   - Header
   - Summary
   - Experience
   - Skills
   - Education
   - Optional sections when present
7. Final review
8. Export

## Product Principles

- Keep the workflow linear and low-stress.
- Do not show AI before the first draft exists.
- Keep AI scoped to the active section only.
- Make parsing and rewrite behavior visible and reversible.
- Prefer deterministic cleanup and validation where possible.
- Do not scrape LinkedIn or imply unsupported access.

## Import Principles

- Expect messy pasted input by default.
- Strip obvious copied-webpage UI junk before section parsing.
- Keep wrapped bullet lines together.
- Keep contact, location, summary, experience, skills, and education separated sensibly.
- Infer skills conservatively so the final list stays recruiter-readable.

## Resume Quality Principles

- Favor ATS-safer structure:
  - single-column output
  - standard section titles
  - common fonts in exported usage guidance
- Push bullets toward `Context -> Action -> Result`
- Avoid first-person phrasing in resume bullets
- Quantify outcomes only when the source supports them

## Public Repo Notes

- This repo intentionally avoids LinkedIn scraping.
- AI rewrite is optional and requires `OPENAI_API_KEY`.
- Internal planning docs are not intended for the public repo.
