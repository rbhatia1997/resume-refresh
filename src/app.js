import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { analyzeResume } from "./resume-analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(projectRoot, "public");
const sessionCookieName = "resume_refresh_session";
const maxBodyBytes = 6 * 1024 * 1024;
const maxRewriteChars = 18000;
const rateLimits = new Map();
const require = createRequire(import.meta.url);

loadDotEnv();

const linkedInClientId = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || "";
const linkedInClientSecret = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || "";
const linkedInScopes = (process.env.LINKEDIN_SCOPES || "openid profile email").trim();
const appSecret = process.env.APP_SECRET || process.env.SESSION_SECRET || "dev-only-secret-change-me";
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const hasSecureAppSecret = process.env.NODE_ENV !== "production" || appSecret !== "dev-only-secret-change-me";
const openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function getListenConfig() {
  return {
    port: Number(process.env.PORT || 3210),
    host: process.env.HOST || "127.0.0.1"
  };
}

export async function handleRequest(request, { serveStatic = true } = {}) {
  try {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/config") {
      return jsonResponse({
        linkedInAuthEnabled: Boolean(linkedInClientId && linkedInClientSecret && hasSecureAppSecret),
        requiresAppSecret: !hasSecureAppSecret,
        openAiRewriteEnabled: Boolean(openai)
      });
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const session = getSession(request);
      return jsonResponse({
        authenticated: Boolean(session),
        profile: session?.profile || null
      });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/linkedin") {
      assertSecureAppSecret();
      if (!linkedInClientId || !linkedInClientSecret) {
        return jsonResponse({
          error: "LinkedIn auth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
        }, { status: 400 });
      }

      const redirectUri = `${getBaseUrl(request)}/api/auth/linkedin/callback`;
      const state = signToken({
        exp: Date.now() + 10 * 60 * 1000,
        redirectUri
      });
      const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
      authUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: linkedInClientId,
        redirect_uri: redirectUri,
        scope: linkedInScopes,
        state
      }).toString();
      return redirectResponse(authUrl.toString());
    }

    if (request.method === "GET" && url.pathname === "/api/auth/linkedin/callback") {
      assertSecureAppSecret();
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const error = url.searchParams.get("error") || "";
      const parsedState = verifyToken(state);

      if (error) {
        return redirectResponse("/?linkedin=denied");
      }

      if (!parsedState || parsedState.exp < Date.now() || !code) {
        return redirectResponse("/?linkedin=invalid");
      }

      try {
        const tokenPayload = await exchangeLinkedInCode({
          code,
          redirectUri: parsedState.redirectUri
        });
        const profile = await fetchLinkedInUser(tokenPayload.access_token);
        return redirectResponse("/?linkedin=connected", {
          cookies: [buildSessionCookie(profile)]
        });
      } catch {
        return redirectResponse("/?linkedin=failed");
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      assertSecureAppSecret();
      enforceSameOrigin(request);
      return jsonResponse({ ok: true }, {
        cookies: [clearSessionCookie()]
      });
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "analyze", { limit: 20, windowMs: 60_000 });
      const body = await readJsonBody(request);
      const resolvedResumeText = await extractResumeText(body);
      const session = getSession(request);
      const linkedInProfileText = profileToText(session?.profile);
      const linkedInText = [linkedInProfileText, body.linkedinText || ""].filter(Boolean).join("\n");
      const result = analyzeResume({
        linkedinText: linkedInText,
        linkedinUrl: body.linkedinUrl || "",
        resumeText: resolvedResumeText,
        targetRole: body.targetRole || ""
      });

      return jsonResponse({
        ...result,
        extractedResumeText: resolvedResumeText,
        linkedInProfile: session?.profile || null
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rewrite") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "rewrite", { limit: 8, windowMs: 60_000 });
      assertOpenAiConfigured();
      const body = await readJsonBody(request);
      const rewritten = await rewriteWithOpenAI(body);
      return jsonResponse(rewritten);
    }

    if (serveStatic) {
      return serveStaticAsset(url.pathname);
    }

    return textResponse("Not found", { status: 404 });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 400 });
  }
}

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
    // Optional.
  }
}

function assertSecureAppSecret() {
  if (!hasSecureAppSecret) {
    throw new Error("APP_SECRET must be set in production.");
  }
}

function assertOpenAiConfigured() {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}

function enforceSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }
  if (origin !== getBaseUrl(request)) {
    throw new Error("Invalid request origin.");
  }
}

function getClientAddress(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "unknown";
}

function enforceRateLimit(request, action, { limit, windowMs }) {
  const key = `${action}:${getClientAddress(request)}`;
  const now = Date.now();
  const bucket = rateLimits.get(key) || { count: 0, expiresAt: now + windowMs };

  if (bucket.expiresAt <= now) {
    bucket.count = 0;
    bucket.expiresAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimits.set(key, bucket);

  if (bucket.count > limit) {
    throw new Error("Too many requests. Please wait a minute and try again.");
  }
}

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
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

function getBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  return new URL(request.url).origin;
}

function getSecurityHeaders(contentType = "text/plain; charset=utf-8") {
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cache-control": contentType.includes("text/html") ? "public, max-age=0, must-revalidate" : "no-store",
    "content-security-policy": "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self' https://www.linkedin.com; frame-ancestors 'none'"
  };
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production" || /^https:/i.test(process.env.PUBLIC_BASE_URL || "");
}

function signValue(value) {
  return crypto.createHmac("sha256", appSecret).update(value).digest("base64url");
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signValue(encoded)}`;
}

function verifyToken(token) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }
  const expected = signValue(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  const valid = crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  if (!valid) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeLinkedInProfile(profile = {}) {
  const name = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ").trim();
  return {
    id: profile.sub || "",
    name,
    email: profile.email || "",
    picture: profile.picture || ""
  };
}

function buildSessionCookie(profile) {
  const token = signToken({
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    v: 1,
    profile: {
      id: profile.id || "",
      name: profile.name || "",
      email: profile.email || "",
      picture: profile.picture || ""
    }
  });
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${isSecureCookie() ? "; Secure" : ""}`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureCookie() ? "; Secure" : ""}`;
}

function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[sessionCookieName];
  if (!token) {
    return null;
  }
  const session = verifyToken(token);
  if (!session || session.exp < Date.now()) {
    return null;
  }
  return session;
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

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) {
    throw new Error("Payload too large. Keep uploads under 6 MB.");
  }

  const raw = await request.text();
  if (raw.length > maxBodyBytes) {
    throw new Error("Payload too large. Keep uploads under 6 MB.");
  }
  return raw ? JSON.parse(raw) : {};
}

async function extractResumeText({ resumeText = "", resumeFileName = "", resumeFileBase64 = "" }) {
  if (resumeText.trim()) {
    return resumeText;
  }

  if (!resumeFileBase64) {
    return "";
  }

  const buffer = Buffer.from(resumeFileBase64, "base64");
  if (buffer.byteLength > 4.5 * 1024 * 1024) {
    throw new Error("Resume file is too large. Keep files under 4.5 MB.");
  }

  const extension = path.extname(resumeFileName).toLowerCase();
  if (extension === ".pdf") {
    const pdfParse = require("pdf-parse");
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  }

  if ([".txt", ".md"].includes(extension)) {
    return buffer.toString("utf8");
  }

  throw new Error("Unsupported file type. Use PDF, TXT, or MD.");
}

async function rewriteWithOpenAI(body) {
  const resumeText = String(body.resumeText || "").trim();
  const linkedinText = String(body.linkedinText || "").trim();
  const targetRole = String(body.targetRole || "").trim();
  const style = String(body.style || "concise").trim();

  if (!resumeText && !linkedinText) {
    throw new Error("Provide resume or LinkedIn text first.");
  }

  const sourceText = [resumeText, linkedinText].filter(Boolean).join("\n\n");
  if (sourceText.length > maxRewriteChars) {
    throw new Error("Input is too long for AI rewrite. Trim it below 18,000 characters.");
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are an expert resume writer. Rewrite resumes to be crisp, ATS-friendly, quantified where possible, and tailored to the target role. Never invent facts. If information is missing, preserve the claim but avoid fabricating metrics."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Target role: ${targetRole || "Not provided"}\nPreferred style: ${style}\n\nSource material:\n${sourceText}\n\nReturn JSON with keys: summary, rewritten_resume, bullet_improvements, notes. summary should be 1 short sentence. rewritten_resume should be plain text. bullet_improvements should be an array of short rewrite tips. notes should be an array of caveats where facts or metrics are missing.`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "resume_rewrite",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            rewritten_resume: { type: "string" },
            bullet_improvements: {
              type: "array",
              items: { type: "string" }
            },
            notes: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "rewritten_resume", "bullet_improvements", "notes"]
        }
      }
    }
  });

  const payload = JSON.parse(response.output_text || "{}");
  return {
    summary: payload.summary || "",
    rewrittenResume: payload.rewritten_resume || "",
    bulletImprovements: Array.isArray(payload.bullet_improvements) ? payload.bullet_improvements : [],
    notes: Array.isArray(payload.notes) ? payload.notes : []
  };
}

async function serveStaticAsset(pathname) {
  const resolvedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(publicDir, `.${resolvedPath}`);
  if (!filePath.startsWith(publicDir)) {
    return textResponse("Forbidden", { status: 403 });
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const contentType = mimeTypes[extension] || "application/octet-stream";
    return new Response(content, {
      status: 200,
      headers: getSecurityHeaders(contentType)
    });
  } catch {
    return textResponse("Not found", { status: 404 });
  }
}

function jsonResponse(payload, { status = 200, cookies = [] } = {}) {
  return withCookies(new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: getSecurityHeaders("application/json; charset=utf-8")
  }), cookies);
}

function textResponse(text, { status = 200 } = {}) {
  return new Response(text, {
    status,
    headers: getSecurityHeaders("text/plain; charset=utf-8")
  });
}

function redirectResponse(location, { cookies = [] } = {}) {
  return withCookies(new Response(null, {
    status: 302,
    headers: {
      ...getSecurityHeaders("text/plain; charset=utf-8"),
      location
    }
  }), cookies);
}

function withCookies(response, cookies) {
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
