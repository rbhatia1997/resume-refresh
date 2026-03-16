import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeResume } from "./resume-analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(__dirname, "../public");
const swiftExtractor = path.resolve(__dirname, "./pdf-extract.swift");
const sessionCookieName = "resume_refresh_session";
const sessions = new Map();
const oauthStates = new Map();

loadDotEnv();

const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || "127.0.0.1";
const linkedInClientId = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || "";
const linkedInClientSecret = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || "";
const linkedInScopes = (process.env.LINKEDIN_SCOPES || "openid profile email").trim();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function loadDotEnv() {
  const envPath = path.join(projectRoot, ".env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional file for local and hosted setups.
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function extractPdfTextFromBase64(fileName, base64) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-refresh-"));
  const tempPath = path.join(tempDir, fileName || "resume.pdf");

  try {
    await fs.writeFile(tempPath, Buffer.from(base64, "base64"));
    const result = spawnSync("swift", [swiftExtractor, tempPath], {
      encoding: "utf8",
      timeout: 30000
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || "Swift PDF extraction failed");
    }

    return result.stdout.trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function randomToken(size = 24) {
  return crypto.randomBytes(size).toString("base64url");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : "http";
  return `${protocol}://${req.headers.host}`;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[sessionCookieName];
  if (!sessionId) {
    return null;
  }
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return { id: sessionId, ...session };
}

function setSessionCookie(res, sessionId) {
  const isSecure = process.env.NODE_ENV === "production" || /^https:/i.test(process.env.PUBLIC_BASE_URL || "");
  res.setHeader("set-cookie", `${sessionCookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`);
}

function clearSessionCookie(res) {
  res.setHeader("set-cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function createSession(profile) {
  const sessionId = randomToken(18);
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  sessions.set(sessionId, { profile, expiresAt });
  return sessionId;
}

function createOauthState(req) {
  const state = randomToken(18);
  oauthStates.set(state, {
    nonce: randomToken(18),
    redirectUri: `${getBaseUrl(req)}/auth/linkedin/callback`,
    expiresAt: Date.now() + 1000 * 60 * 10
  });
  return state;
}

function normalizeLinkedInProfile(profile = {}) {
  const localizedName = `${profile.localizedFirstName || ""} ${profile.localizedLastName || ""}`.trim();
  const fullName = profile.name
    || [profile.given_name, profile.family_name].filter(Boolean).join(" ").trim()
    || localizedName;
  const email = profile.email || profile.emailAddress || "";
  const picture = profile.picture || profile.pictureUrl || "";
  return {
    id: profile.sub || profile.id || "",
    name: fullName,
    email,
    picture,
    raw: profile
  };
}

function profileToText(profile) {
  if (!profile) {
    return "";
  }
  const lines = [];
  if (profile.name) {
    lines.push(`Name: ${profile.name}`);
  }
  if (profile.email) {
    lines.push(`Email: ${profile.email}`);
  }
  return lines.join("\n");
}

async function exchangeLinkedInCode({ code, redirectUri }) {
  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: linkedInClientId,
      client_secret: linkedInClientSecret,
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`LinkedIn token exchange failed with ${tokenResponse.status}`);
  }

  return tokenResponse.json();
}

async function fetchLinkedInUser(accessToken) {
  const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    throw new Error(`LinkedIn userinfo failed with ${userResponse.status}`);
  }

  return normalizeLinkedInProfile(await userResponse.json());
}

async function extractResumeText({ resumeText = "", resumeFileName = "", resumeFileBase64 = "" }) {
  if (resumeText.trim()) {
    return resumeText;
  }

  if (!resumeFileBase64) {
    return "";
  }

  const extension = path.extname(resumeFileName).toLowerCase();
  if (extension === ".pdf") {
    return extractPdfTextFromBase64(resumeFileName, resumeFileBase64);
  }

  if ([".txt", ".md"].includes(extension)) {
    return Buffer.from(resumeFileBase64, "base64").toString("utf8");
  }

  throw new Error("Unsupported file type. Use PDF, TXT, or MD.");
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, getBaseUrl(req)).pathname;
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(publicDir, `.${requestPath}`);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, getBaseUrl(req));

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      linkedInAuthEnabled: Boolean(linkedInClientId && linkedInClientSecret)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = getSession(req);
    sendJson(res, 200, {
      authenticated: Boolean(session),
      profile: session?.profile || null
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/linkedin") {
    if (!linkedInClientId || !linkedInClientSecret) {
      sendJson(res, 400, {
        error: "LinkedIn auth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
      });
      return;
    }

    const state = createOauthState(req);
    const { nonce, redirectUri } = oauthStates.get(state);
    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: linkedInClientId,
      redirect_uri: redirectUri,
      scope: linkedInScopes,
      state,
      nonce
    }).toString();
    redirect(res, authUrl.toString());
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/linkedin/callback") {
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const error = url.searchParams.get("error") || "";
    const stateRecord = oauthStates.get(state);
    oauthStates.delete(state);

    if (error) {
      redirect(res, "/?linkedin=denied");
      return;
    }

    if (!stateRecord || stateRecord.expiresAt < Date.now() || !code) {
      redirect(res, "/?linkedin=invalid");
      return;
    }

    try {
      const tokenPayload = await exchangeLinkedInCode({
        code,
        redirectUri: stateRecord.redirectUri
      });
      const profile = await fetchLinkedInUser(tokenPayload.access_token);
      const sessionId = createSession(profile);
      setSessionCookie(res, sessionId);
      redirect(res, "/?linkedin=connected");
    } catch {
      redirect(res, "/?linkedin=failed");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const session = getSession(req);
    if (session) {
      sessions.delete(session.id);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const body = await readJsonBody(req);
      const resolvedResumeText = await extractResumeText(body);
      const session = getSession(req);
      const linkedInProfileText = profileToText(session?.profile);
      const linkedInText = [linkedInProfileText, body.linkedinText || ""].filter(Boolean).join("\n");
      const result = analyzeResume({
        linkedinText,
        linkedinUrl: body.linkedinUrl || "",
        resumeText: resolvedResumeText,
        targetRole: body.targetRole || ""
      });

      sendJson(res, 200, {
        ...result,
        extractedResumeText: resolvedResumeText,
        linkedInProfile: session?.profile || null
      });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return;
  }

  return serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Resume Refresh running at http://${host}:${port}`);
});
