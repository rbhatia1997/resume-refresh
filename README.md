# Resume Refresh

Paste your resume, describe what you're targeting, and get a polished, ATS-ready draft — section by section.

**Live demo:** [resume-refresh-ten.vercel.app](https://resume-refresh-ten.vercel.app)

---

## What it does

- Accepts a resume as plain text, PDF, TXT, MD, JPG, PNG, or WEBP
- Optionally paste your LinkedIn headline/about/experience for added context
- Shows optional section-level suggestion cards while you edit
- Exports to PDF or DOCX with right-aligned job dates and clean section formatting
- Works without an API key for text/PDF/TXT/MD resumes; resume photos require OpenAI vision OCR

## Run locally

```bash
npm install
cp .env.example .env   # fill in at minimum APP_SECRET
npm start
```

Open `http://localhost:3210`. Node 20+ required.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `APP_SECRET` | Yes | Random secret for session signing. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OPENAI_API_KEY` | No | Required only for JPG/PNG/WEBP resume photo parsing via OpenAI vision OCR |
| `OPENAI_MODEL` | No | OpenAI model for optional model-backed operations (default: `gpt-4.1-mini`) |
| `OPENAI_VISION_MODEL` | No | OpenAI model for resume photo OCR (defaults to `OPENAI_MODEL`) |
| `LINKEDIN_CLIENT_ID` | No | Only needed if you want LinkedIn sign-in |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth |
| `PUBLIC_BASE_URL` | No | Full origin URL used for OAuth redirects (e.g. `https://your-domain.com`) |
| `DAILY_EDIT_LIMIT` | No | Shared per-IP daily limit for edit-producing calls (`/api/analyze` and `/api/rewrite`). Defaults to `10` |

See `.env.example` for the full list with comments.

## Deploy to Vercel

```bash
vercel
```

Set the environment variables above in the Vercel dashboard. The `vercel.json` at the repo root handles routing and security headers.

## Deploy elsewhere

Any Node 20+ host works. Run `node src/server.js` and set the environment variables.

Tested on Render, Railway, Fly.io, and plain Linux VPS.

## Tests

```bash
npm test          # unit tests (Node built-in test runner)
npm run test:e2e  # Playwright end-to-end tests
```

## Project structure

```
api/        Vercel serverless function handlers
src/        Core logic (app router, inference, resume analysis, export)
public/     Static frontend (HTML, CSS, JS)
```

## Security

- Sessions signed with `APP_SECRET`
- Rate-limited per IP: 10 edit-producing calls per day by default, plus short-window burst limits on analyze/rewrite/export
- Security headers on all responses (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options)
- Request body and file upload size limits enforced
- PDF/DOCX export rejects resumes that exceed the one-page budget instead of silently creating a long/clipped export
- No resume data stored server-side
- Rate-limit subjects are HMAC-hashed in memory; raw IPs are not persisted by the app
- Photo resume parsing sends the uploaded image to the configured OpenAI vision model for OCR; text/PDF/TXT/MD parsing stays server-local

The built-in limiter is process-local, which is sufficient for a single Node process and local development. On horizontally scaled/serverless deployments, enforce the same daily limits at the platform edge or with shared infrastructure if you need a strict global quota across instances.

## LinkedIn sign-in (optional, not surfaced in the default UI)

The server includes a LinkedIn OAuth flow, but the default UI uses paste-only for LinkedIn content. To enable sign-in:

1. Create a LinkedIn app and enable `Sign In with LinkedIn using OpenID Connect`
2. Fill in `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `PUBLIC_BASE_URL` in `.env`
3. Add your redirect URL to the LinkedIn app:
   - Production: `https://your-domain.com/api/auth/linkedin/callback`
   - Local: `http://127.0.0.1:3210/api/auth/linkedin/callback`

Note: LinkedIn's standard OAuth only provides basic identity (name, email, photo). Full profile data like experience and skills history is not available via API — paste that content directly into the LinkedIn field instead.

## License

MIT
