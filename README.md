# Resume Refresh

Local resume improvement tool that:

- runs as a browser-based web app
- supports LinkedIn sign-in with official OpenID Connect
- accepts pasted LinkedIn content
- accepts a resume in `PDF`, `TXT`, or `MD`
- extracts text from PDFs in Node, so it can run on hosted Linux platforms
- returns improvement suggestions and an updated resume draft
- optionally generates an OpenAI-powered rewrite

## Run

```bash
cd "/Users/isacarius/Documents/1. GITHUB/resume-refresh"
npm start
```

Open `http://localhost:3210`.

The current guided rollout surface is `http://localhost:3210/v2.html`.

## Test

```bash
npm test
npm run test:e2e
```

## Security

- OAuth state and session data are signed with `APP_SECRET`
- cookies are `HttpOnly` and `SameSite=Lax`
- request bodies and uploads are size-limited
- write-heavy endpoints are same-origin checked and rate-limited
- the client UI avoids rendering suggestion/profile data with `innerHTML`
- security headers are set on app responses

Set a strong random `APP_SECRET` in production.

## OpenAI Rewrite

Set `OPENAI_API_KEY` to enable AI-powered resume rewrites.

Without it, the app still works for parsing and suggestions, but the `AI Rewrite` button stays disabled.

## LinkedIn Auth Setup

1. Create a LinkedIn app and enable `Sign In with LinkedIn using OpenID Connect`.
2. Copy `.env.example` to `.env`.
3. Fill in `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `APP_SECRET`, and `PUBLIC_BASE_URL`.
4. In the LinkedIn app, add this redirect URL:

```text
https://your-domain.com/api/auth/linkedin/callback
```

For local development, use:

```text
http://127.0.0.1:3210/api/auth/linkedin/callback
```

## Deploy

This app can run locally with `node src/server.js`, and it now includes Vercel deployment files.

### Vercel

```bash
vercel
```

Set these environment variables in Vercel:

- `PUBLIC_BASE_URL`
- `APP_SECRET`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `OPENAI_API_KEY` if you want AI rewrite enabled

Then update the LinkedIn redirect URL to:

```text
https://your-vercel-domain.vercel.app/api/auth/linkedin/callback
```

### Other Node hosts

This app can also be deployed to any host that can run `node src/server.js`, including:

- Render
- Railway
- Fly.io
- a VPS with `systemd` and Nginx

Required environment variables:

- `PUBLIC_BASE_URL`
- `APP_SECRET`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `OPENAI_API_KEY` if you want AI rewrite enabled

## Notes

- LinkedIn login is implemented with the official OpenID Connect flow. That gets basic identity fields such as name, photo, and email.
- Direct LinkedIn scraping is intentionally not built in.
- Rich LinkedIn profile data like full experience/history is not reliably available to standard apps, so the safest workflow is still to paste your LinkedIn headline/about/experience/skills into the LinkedIn field.
- The suggestion engine is deterministic, so it works offline and without API keys.
