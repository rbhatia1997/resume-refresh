# Agents

This file describes how AI coding agents should work with this repository.

## Project overview

Resume Refresh is a Node.js ESM web app. It runs as a single-file HTTP server (`src/app.js`) locally and as Vercel serverless functions (`api/*.js`) in production. Both entry points share the same core logic via `src/`.

## Architecture

```
src/app.js              Main request router and all business logic
src/inference.js        OpenAI photo OCR and legacy model adapter
src/resume-analyzer.js  Rule-based resume analysis
src/resume-validator.js Input validation
src/skills-grounding.js Skills extraction and grounding
src/text-normalizer.js  Text cleanup utilities
src/server.js           Local Node HTTP wrapper (not used on Vercel)

api/_handler.js         Shared Vercel handler that delegates to src/app.js
api/analyze.js          POST /api/analyze
api/rewrite.js          POST /api/rewrite
api/export.js           POST /api/export
api/config.js           GET /api/config
api/session.js          Session management
api/auth/               LinkedIn OAuth flow

public/index.html       v1 UI (current production)
public/app.js           v1 frontend JavaScript
```

## How to run and test

```bash
npm install
cp .env.example .env    # set at minimum APP_SECRET
npm start               # local server at http://localhost:3210
npm test                # unit tests
npm run test:e2e        # Playwright tests
```

## Key conventions

**ESM only.** The package uses `"type": "module"`. All imports use `.js` extensions. No CommonJS (`require`).

**No build step.** `src/` files are run directly with Node, and the production frontend is plain HTML/CSS/JS in `public/`.

**Named exports only in the docx package.** The `docx` npm package in ESM mode throws a `SyntaxError` for any named export that doesn't exist. Do not add new named imports from `docx` without verifying they exist in the installed version (`node_modules/docx/build/index.js`).

**Vercel routing.** `vercel.json` uses legacy `routes[]`. Security headers live inside a `"continue": true` route entry at the top of that array — do not add a separate top-level `headers[]` section, as it is silently ignored when `routes[]` is defined.

**Inference is isolated.** `src/inference.js` is the only file that knows about OpenAI-backed resume photo OCR and model-backed legacy rewrite calls.

## Making changes

- Changes to `src/app.js` affect both local and Vercel deployments
- The frontend is in `public/app.js` (vanilla JS, no build step)
- Export logic (PDF and DOCX) lives in `src/app.js` in `buildPdf` and `buildDocx`

## Environment

Requires Node 20+. No database. State lives in signed session cookies. No server-side resume storage.

Required in production: `APP_SECRET`
Optional: `OPENAI_API_KEY` for JPG/PNG/WEBP resume photo parsing, LinkedIn OAuth vars

## Tests

Unit tests use Node's built-in test runner (`node --test`). Test files are colocated with source files (`*.test.js`). E2E tests use Playwright and live in `tests/`.

When adding new functionality, add a corresponding test in the same directory as the source file.
