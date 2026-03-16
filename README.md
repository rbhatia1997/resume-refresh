# Resume Refresh

Local resume improvement tool that:

- runs as a browser-based web app
- supports LinkedIn sign-in with official OpenID Connect
- accepts pasted LinkedIn content
- accepts a resume in `PDF`, `TXT`, or `MD`
- extracts text from PDFs using native macOS `PDFKit` through `swift`
- returns improvement suggestions and an updated resume draft

## Run

```bash
cd "/Users/isacarius/Documents/1. GITHUB/resume-refresh"
npm start
```

Open `http://localhost:3210`.

## LinkedIn Auth Setup

1. Create a LinkedIn app and enable `Sign In with LinkedIn using OpenID Connect`.
2. Copy `.env.example` to `.env`.
3. Fill in `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `PUBLIC_BASE_URL`.
4. In the LinkedIn app, add this redirect URL:

```text
https://your-domain.com/auth/linkedin/callback
```

For local development, use:

```text
http://127.0.0.1:3210/auth/linkedin/callback
```

## Deploy

This app is a plain Node server, so it can be deployed to any host that can run `node src/server.js`, including:

- Render
- Railway
- Fly.io
- a VPS with `systemd` and Nginx

Required environment variables:

- `PUBLIC_BASE_URL`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

## Notes

- LinkedIn login is implemented with the official OpenID Connect flow. That gets basic identity fields such as name, photo, and email.
- Direct LinkedIn scraping is intentionally not built in.
- Rich LinkedIn profile data like full experience/history is not reliably available to standard apps, so the safest workflow is still to paste your LinkedIn headline/about/experience/skills into the LinkedIn field.
- The suggestion engine is deterministic, so it works offline and without API keys.
- PDF extraction is macOS-specific because it uses `PDFKit`.
