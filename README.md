# Resume Refresh

Paste your resume, describe what you're targeting, and get a polished, ATS-ready draft — section by section.

**Live demo:** [resume-refresh-ten.vercel.app](https://resume-refresh-ten.vercel.app)

---

## What it does

- Accepts a resume as plain text, PDF, TXT, or MD
- Optionally paste your LinkedIn headline/about/experience for added context
- Returns bullet-by-bullet improvement suggestions plus a full rewrite
- Exports to PDF or DOCX with right-aligned job dates and clean section formatting
- Works without an API key (rule-based suggestions); plug in OpenAI or a local Ollama model to unlock AI rewrite

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
| `OPENAI_API_KEY` | No | Enables AI-powered rewrite via OpenAI (`gpt-4.1-mini`) |
| `INFERENCE_PROVIDER` | No | Set to `ollama` to use a local model instead of OpenAI |
| `OLLAMA_URL` | No | Ollama base URL (default: `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | No | Model name (default: `qwen2.5:7b`) |
| `LINKEDIN_CLIENT_ID` | No | Only needed if you want LinkedIn sign-in |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth |
| `PUBLIC_BASE_URL` | No | Full origin URL used for OAuth redirects (e.g. `https://your-domain.com`) |

See `.env.example` for the full list with comments.

## Using a local model (Ollama)

```bash
brew install ollama
ollama pull qwen2.5:7b
ollama serve
```

Then in `.env`:

```
INFERENCE_PROVIDER=ollama
```

Works well for bullet strengthening and wording cleanup. For full resume rewrites, a cloud model gives better results.

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
- Rate-limited per IP: 20 analyze / 8 rewrite / 12 export requests per minute
- Security headers on all responses (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options)
- Request body and file upload size limits enforced
- No resume data stored server-side

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
