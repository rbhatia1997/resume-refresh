# Resume Refresh

Resume Refresh is a guided resume improvement app that:

- runs as a browser-based web app
- supports resume upload and pasted profile/resume text
- cleans noisy pasted input before structuring it into resume sections
- guides users through header, summary, experience, skills, education, final review, and export
- provides deterministic resume analysis plus optional OpenAI-powered rewrite previews

## Run

```bash
git clone <your-fork-or-this-repo-url>
cd resume-refresh
npm install
npm start
```

Open `http://127.0.0.1:3210`.

The current guided product surface is `http://127.0.0.1:3210/v2.html`.

## Test

```bash
npm test
npm run test:e2e
```

## Security

- request bodies and uploads are size-limited
- write-heavy endpoints are same-origin checked and rate-limited
- the client UI avoids rendering suggestion/profile data with `innerHTML`
- security headers are set on app responses
- local draft state is stored in browser `sessionStorage`, not a remote database

## Public Repo Safety

This repo is intended to be safe for public GitHub as long as secrets stay in local or hosted environment configuration.

- `.env` is ignored and should never be committed
- internal planning docs under `docs/superpowers/` are ignored
- no LinkedIn scraping is implemented
- AI rewrite is optional and server-side only

## OpenAI Rewrite

Set `OPENAI_API_KEY` to enable AI-powered resume rewrites.

Without it, the app still works for parsing, structuring, and deterministic suggestions, but AI preview actions stay disabled.

## Import Flow

The app does not scrape LinkedIn or require LinkedIn OAuth.

Instead, the app asks the user to paste:

- a profile URL, if helpful
- pasted profile/about text
- pasted experience text
- skills text, if helpful
- or an uploaded resume file in `PDF`, `TXT`, or `MD`

This is intentional. Pulling richer LinkedIn profile data by scraping would violate LinkedIn's rules, so the app only works with content the user provides directly.

## Deploy

This app can run locally with `node src/server.js`, and it now includes Vercel deployment files.

### Vercel

```bash
vercel
```

Set these environment variables in Vercel:

- `PUBLIC_BASE_URL`
- `OPENAI_API_KEY` if you want AI rewrite enabled

### Other Node hosts

This app can also be deployed to any host that can run `node src/server.js`, including:

- Render
- Railway
- Fly.io
- a VPS with `systemd` and Nginx

Required environment variables:

- `PUBLIC_BASE_URL`
- `OPENAI_API_KEY` if you want AI rewrite enabled

## Notes

- Direct LinkedIn scraping is intentionally not built in.
- The guided import flow is based on user-provided pasted text or uploaded files.
- Rich LinkedIn profile data like full experience history is not reliably available to standard apps, so the safest workflow is still to paste your own content into the app.
- The deterministic suggestion engine works without API keys.
