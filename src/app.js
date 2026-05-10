import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun, TabStopType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { analyzeResume } from "./resume-analyzer.js";
import { normalizeInputText } from "./text-normalizer.js";
import { buildResumeValidationFromText } from "./resume-validator.js";
import { callModel, isModelConfigured, getProviderLabel, extractTextFromResumeImage } from "./inference.js";
import { classifyResumeUpload } from "./resume-upload.js";
import { splitJobDate } from "./export-format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(projectRoot, "public");

loadDotEnv();

const sessionCookieName = "resume_refresh_session";
export const MAX_BODY_BYTES = 6 * 1024 * 1024;
const maxRewriteChars = 10000;
const maxOnePageExportLines = 64;
const compactListSectionKeys = new Set(["skills", "languages", "hobbies", "interests"]);
const dailyEditLimit = parsePositiveInteger(process.env.DAILY_EDIT_LIMIT, 10);
const dailyEditWindowMs = 24 * 60 * 60 * 1000;
const maxRateLimitBuckets = 5000;
const rateLimits = new Map();
const require = createRequire(import.meta.url);

const linkedInClientId = process.env.LINKEDIN_CLIENT_ID || process.env.LI_CLIENT_ID || "";
const linkedInClientSecret = process.env.LINKEDIN_CLIENT_SECRET || process.env.LI_CLIENT_SECRET || "";
const linkedInScopes = (process.env.LINKEDIN_SCOPES || "openid profile email").trim();
const appSecret = process.env.APP_SECRET || process.env.SESSION_SECRET || "dev-only-secret-change-me";
const hasSecureAppSecret = process.env.NODE_ENV !== "production" || appSecret !== "dev-only-secret-change-me";

if (process.env.NODE_ENV === "production" && !hasSecureAppSecret) {
  throw new Error("FATAL: APP_SECRET must be set to a strong random value in production. Do not use the default.");
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

class AppError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

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
        linkedInAuthEnabled:  Boolean(linkedInClientId && linkedInClientSecret && hasSecureAppSecret),
        requiresAppSecret:    !hasSecureAppSecret,
        openAiRewriteEnabled: isModelConfigured(),
        inferenceProvider:    getProviderLabel()
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
      const returnTo = sanitizeReturnTo(url.searchParams.get("return_to"));
      const state = signToken({
        exp: Date.now() + 10 * 60 * 1000,
        redirectUri,
        returnTo
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
        return redirectResponse(buildAuthRedirect(parsedState?.returnTo, "denied"));
      }

      if (!parsedState || parsedState.exp < Date.now() || !code) {
        return redirectResponse(buildAuthRedirect(parsedState?.returnTo, "invalid"));
      }

      try {
        const tokenPayload = await exchangeLinkedInCode({
          code,
          redirectUri: parsedState.redirectUri
        });
        const profile = await fetchLinkedInUser(tokenPayload.access_token);
        return redirectResponse(buildAuthRedirect(parsedState.returnTo, "connected"), {
          cookies: [buildSessionCookie(profile)]
        });
      } catch {
        return redirectResponse(buildAuthRedirect(parsedState.returnTo, "failed"));
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
      enforceDailyEditLimit(request);
      const body = await readJsonBody(request);
      const rawResumeText = await extractResumeText(body);
      const targetRoleInput = String(body.targetRole || "").trim();
      const linkedinTextInput = String(body.linkedinText || "").trim();
      if (targetRoleInput.length > 500) {
        throw new Error("Target role is too long (max 500 characters).");
      }
      if (linkedinTextInput.length > 50_000) {
        throw new Error("LinkedIn text is too long (max 50,000 characters).");
      }
      const session = getSession(request);
      const linkedInProfileText = profileToText(session?.profile);

      // Normalize messy pasted content before analysis
      const cleanedResumeText  = normalizeInputText(rawResumeText);
      const cleanedLinkedInText = normalizeInputText(
        [linkedInProfileText, body.linkedinText || ""].filter(Boolean).join("\n")
      );

      const result = analyzeResume({
        linkedinText: cleanedLinkedInText,
        linkedinUrl:  body.linkedinUrl || "",
        resumeText:   cleanedResumeText,
        targetRole:   body.targetRole || ""
      });

      return jsonResponse({
        ...result,
        linkedInProfile: session?.profile ? {
          name: session.profile.name || "",
          email: session.profile.email || ""
        } : null
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rewrite") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "rewrite", { limit: 8, windowMs: 60_000 });
      enforceDailyEditLimit(request);
      assertModelConfigured();
      const body = await readJsonBody(request);
      const rewritten = await rewriteWithOpenAI(body);
      return jsonResponse(rewritten);
    }

    if (request.method === "POST" && url.pathname === "/api/export") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "export", { limit: 12, windowMs: 60_000 });
      const body = await readJsonBody(request);
      return await exportResume(body);
    }

    if (serveStatic) {
      return await serveStaticAsset(url.pathname);
    }

    return textResponse("Not found", { status: 404 });
  } catch (error) {
    return buildErrorResponse(error);
  }
}

export function buildErrorResponse(error) {
  const status = error instanceof AppError ? error.status : Number(error?.status || 400);
  return jsonResponse({
    error: error instanceof Error ? error.message : "Unknown error"
  }, { status: status >= 400 && status < 600 ? status : 400 });
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

function withTimeout(promise, ms, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

function assertSecureAppSecret() {
  if (!hasSecureAppSecret) {
    throw new Error("APP_SECRET must be set in production.");
  }
}

function assertModelConfigured() {
  if (!isModelConfigured()) {
    throw new Error("No inference provider configured. Set OPENAI_API_KEY or configure Ollama.");
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
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim();
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function getRateLimitSubject(request) {
  return crypto
    .createHmac("sha256", appSecret)
    .update(getClientAddress(request))
    .digest("base64url")
    .slice(0, 24);
}

function pruneRateLimits(now = Date.now()) {
  for (const [key, bucket] of rateLimits) {
    if (bucket.expiresAt <= now) {
      rateLimits.delete(key);
    }
  }

  while (rateLimits.size > maxRateLimitBuckets) {
    const oldest = rateLimits.keys().next().value;
    if (!oldest) break;
    rateLimits.delete(oldest);
  }
}

function enforceRateLimit(request, action, { limit, windowMs, message = "Too many requests. Please wait a minute and try again." }) {
  const now = Date.now();
  pruneRateLimits(now);

  const key = `${action}:${getRateLimitSubject(request)}`;
  const bucket = rateLimits.get(key) || { count: 0, expiresAt: now + windowMs };

  if (bucket.expiresAt <= now) {
    bucket.count = 0;
    bucket.expiresAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimits.set(key, bucket);

  if (bucket.count > limit) {
    throw new AppError(message, { status: 429 });
  }
}

function enforceDailyEditLimit(request) {
  enforceRateLimit(request, "edit:daily", {
    limit: dailyEditLimit,
    windowMs: dailyEditWindowMs,
    message: "Daily edit limit reached for this IP. Please try again tomorrow."
  });
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
  const isHttps = isSecureCookie();
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cache-control": contentType.includes("text/html") ? "public, max-age=0, must-revalidate" : "no-store",
    "content-security-policy": "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self' https://www.linkedin.com; frame-ancestors 'none'",
    // HSTS: only emit on HTTPS — prevents downgrade attacks in production
    ...(isHttps ? { "strict-transport-security": "max-age=63072000; includeSubDomains" } : {})
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
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") {
    throw new AppError("Content-Type must be application/json.", { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new AppError("Payload too large. Keep uploads under 6 MB.", { status: 413 });
  }

  const raw = await readRequestText(request);
  return raw ? JSON.parse(raw) : {};
}

async function readRequestText(request) {
  if (!request.body) {
    return "";
  }

  const chunks = [];
  const reader = request.body.getReader();
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
      received += chunk.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new AppError("Payload too large. Keep uploads under 6 MB.", { status: 413 });
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function extractResumeText({ resumeText = "", resumeFileName = "", resumeFileBase64 = "", resumeFileType = "" }) {
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

  const upload = classifyResumeUpload({
    fileName: resumeFileName,
    mimeType: resumeFileType
  });

  if (upload.kind === "pdf") {
    const pdfParse = require("pdf-parse");
    const parsed = await withTimeout(
      pdfParse(buffer),
      30_000,
      "PDF parsing timed out. Try a smaller file or paste the text instead."
    );
    return parsed.text.trim();
  }

  if (upload.kind === "text") {
    return buffer.toString("utf8");
  }

  if (upload.kind === "image") {
    return await withTimeout(
      extractTextFromResumeImage({
        imageBase64: resumeFileBase64,
        mimeType: upload.mimeType
      }),
      60_000,
      "Photo parsing timed out. Try a clearer image, a smaller file, or paste the text instead."
    );
  }

  throw new Error("Unsupported file type. Use PDF, TXT, MD, JPG, PNG, or WEBP.");
}

const AI_ACTION_INSTRUCTIONS = {
  tighten: [
    "TASK: Tighten wording only. Remove filler words, redundant phrases, and padding.",
    "Do not change the structure, order, or content of any section.",
    "Keep every experience entry, every bullet, and every role.",
    "Do not add new content. Only remove unnecessary words.",
    "Target: each bullet should be scannable in under 2 seconds.",
  ],
  ats: [
    "TASK: Improve ATS keyword match for the target role.",
    "Identify 5-10 keywords from the target role context that are missing or underused.",
    "Weave them naturally into existing bullets and the summary — do NOT stuff keywords.",
    "Do not add fake experience. Only use skills/technologies already implied by the source.",
    "Keep all original experience entries intact.",
  ],
  tailor: [
    "TASK: Tailor the resume to the specific target role.",
    "Move the most relevant experience to the front of the experience section.",
    "Reorder bullets within each role to lead with the most relevant impact.",
    "Adjust the summary to speak directly to the target role's priorities.",
    "Do not remove roles — reorder and re-emphasize only.",
  ],
  shorten: [
    "TASK: Shorten the resume to fit one page.",
    "Remove the lowest-signal bullets (vague, redundant, or least relevant to the target role).",
    "Tighten wording throughout.",
    "Keep all roles and companies — only remove individual bullets, not entire jobs.",
    "Aim for 400-550 words in the output. Note in 'notes' what was removed and why.",
  ],
  "strengthen-bullets": [
    "TASK: Strengthen experience bullets only. Do not change the summary, skills, or education.",
    "For each bullet: ensure it starts with a strong past-tense action verb.",
    "Rewrite bullets that use 'helped', 'worked on', 'responsible for', 'assisted with'.",
    "Where possible, add or clarify the outcome (business impact, metric, scope).",
    "Do not invent metrics. Use 'X%' only if there is a basis in the original text.",
    "Preserve all roles, companies, and dates exactly.",
    "In 'bullet_improvements', list each changed bullet as 'Before → After: [reason]'.",
  ],
};

const AI_ACTION_SYSTEM_BASE = [
  "You are an expert resume editor. Follow these rules in ALL actions:",
  "",
  "CRITICAL: The 'Target role context' is for your understanding only.",
  "NEVER copy it verbatim into the resume. NEVER output first-person sentences from it.",
  "NEVER write 'I am applying to...' or 'I want...' in the resume output.",
  "",
  "Core rules:",
  "- Never invent titles, companies, dates, or metrics",
  "- Never delete a role or company silently",
  "- Use past tense for past roles, present tense for current role",
  "- No first-person pronouns in bullets",
  "- ATS-safe section headings: SUMMARY, EXPERIENCE, SKILLS, EDUCATION",
  "- No buzzwords: 'results-driven', 'passionate', 'innovative', 'synergy'",
].join("\n");

async function rewriteWithOpenAI(body) {
  const resumeText   = String(body.resumeText   || "").trim();
  const linkedinText = String(body.linkedinText || "").trim();
  const targetRole   = String(body.targetRole   || "").trim();
  const action       = String(body.action || body.style || "tighten").trim();

  if (!resumeText && !linkedinText) {
    throw new Error("Provide resume or LinkedIn text first.");
  }

  const sourceText = [resumeText, linkedinText].filter(Boolean).join("\n\n");
  if (sourceText.length > maxRewriteChars) {
    throw new Error("Input is too long for AI action. Trim it below 18,000 characters.");
  }

  if (!AI_ACTION_INSTRUCTIONS[action]) {
    throw new AppError(`Unknown action "${action}".`, { status: 400 });
  }
  const actionInstructions = AI_ACTION_INSTRUCTIONS[action].join("\n");

  const userPrompt = [
    `Target role context (context only — do NOT copy verbatim): ${targetRole || "Not specified"}`,
    "",
    actionInstructions,
    "",
    "Source resume:",
    sourceText,
    "",
    "Return JSON with keys: summary, rewritten_resume, bullet_improvements, notes.",
    "- summary: 1 sentence describing what this action changed and why.",
    "- rewritten_resume: the full revised plain text resume.",
    "  Include ONLY sections present in the source. No placeholder text.",
    "- bullet_improvements: array of strings explaining what changed (before → after + reason).",
    "- notes: caveats, limitations, or suggestions for the user to review manually.",
  ].join("\n");

  const rawJson  = await callModel(AI_ACTION_SYSTEM_BASE, userPrompt);
  const payload  = JSON.parse(rawJson || "{}");
  return {
    summary:            payload.summary || "",
    rewrittenResume:    payload.rewritten_resume || "",
    bulletImprovements: Array.isArray(payload.bullet_improvements) ? payload.bullet_improvements : [],
    notes:              Array.isArray(payload.notes) ? payload.notes : []
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

function binaryResponse(buffer, contentType, fileName) {
  const asciiName = String(fileName).replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(String(fileName));
  return new Response(buffer, {
    status: 200,
    headers: {
      ...getSecurityHeaders(contentType),
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
    }
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

function sanitizeReturnTo(value) {
  if (!value || typeof value !== "string") {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function buildAuthRedirect(returnTo = "/", status) {
  const target = sanitizeReturnTo(returnTo);
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}linkedin=${encodeURIComponent(status)}`;
}

function withCookies(response, cookies) {
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

async function exportResume(body) {
  const text          = String(body.text || "").trim();
  const format        = String(body.format || "").trim().toLowerCase();
  const candidateName = String(body.candidateName || "").trim();
  const fileStem      = formatExportFileStem(candidateName);

  if (!text) {
    throw new Error("Nothing to export yet.");
  }

  // Only block truly empty-content issues; relaxed format checks are handled in editor
  if (text.length < 20) {
    throw new Error("Resume content is too short to export.");
  }

  if (format === "docx") {
    const buffer = await buildDocx(text);
    return binaryResponse(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${fileStem}.docx`);
  }

  if (format === "pdf") {
    const buffer = await buildPdf(text);
    return binaryResponse(buffer, "application/pdf", `${fileStem}.pdf`);
  }

  throw new Error("Unsupported export format.");
}

/**
 * Format a candidate name into a clean export filename.
 * "Jane Smith" → "JaneSmith_Resume"
 * Fallback: "resume-refresh_resume"
 */
function formatExportFileStem(candidateName = "") {
  const name = String(candidateName || "").trim();
  if (!name) return "resume-refresh_resume";

  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .filter(p => /^[A-Za-z]/.test(p)); // exclude numeric/symbol tokens

  if (parts.length < 2) return "resume-refresh_resume";
  return `${parts.join("")}_Resume`;
}

function isCompactListSubheading(line = "") {
  const text = String(line || "").trim().replace(/:$/, "");
  return text.length >= 3
    && text.length <= 30
    && /^[A-Z][A-Z\s/&-]+$/.test(text)
    && !/[0-9]/.test(text);
}

function splitCompactListItems(line = "") {
  const cleaned = String(line || "").trim().replace(/^[-*•]\s*/, "");
  if (!cleaned) return [];
  return cleaned
    .split(/\s*[|,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushCompactListRow(rows, items, maxChars = 96) {
  let current = "";
  for (const item of items) {
    const next = current ? `${current} | ${item}` : item;
    if (current && next.length > maxChars) {
      rows.push(current);
      current = item;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
}

function compactListSectionLines(lines = []) {
  const rows = [];
  let pending = [];

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    if (isCompactListSubheading(line)) {
      pushCompactListRow(rows, pending);
      pending = [];
      rows.push(line.replace(/:$/, "").toUpperCase());
      continue;
    }

    pending.push(...splitCompactListItems(line));
  }

  pushCompactListRow(rows, pending);
  return rows;
}

export function parseResumeForExport(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd());
  const headingMap = new Map([
    ["summary", "summary"],
    ["professional summary", "summary"],
    ["profile", "summary"],
    ["about", "summary"],
    ["experience", "experience"],
    ["work experience", "experience"],
    ["experience highlights", "experience"],
    ["skills", "skills"],
    ["core skills", "skills"],
    ["technical skills", "skills"],
    ["education", "education"],
    ["projects", "projects"],
    ["projects hobbies", "projects"],
    ["interests", "interests"],
    ["hobbies", "hobbies"],
    ["hobbies interests", "hobbies"],
    ["languages", "languages"],
    ["certifications", "certifications"],
    ["licenses", "licenses"],
    ["licensure", "licenses"],
    ["publications", "publications"],
    ["research", "research"],
    ["coursework", "coursework"],
    ["relevant coursework", "coursework"],
    ["community", "community"],
    ["community involvement", "community"],
    ["extracurriculars", "extracurriculars"],
    ["activities", "extracurriculars"],
    ["military service", "military"],
    ["professional development", "development"],
    ["training", "development"],
    ["portfolio", "portfolio"],
    ["leadership", "community"],
    ["volunteer", "community"],
    ["volunteering", "community"]
  ]);

  const sections = {
    header: [],
    summary: [],
    experience: [],
    skills: [],
    education: [],
    projects: [],
    certifications: [],
    licenses: [],
    publications: [],
    research: [],
    coursework: [],
    community: [],
    extracurriculars: [],
    military: [],
    development: [],
    portfolio: [],
    hobbies: [],
    languages: [],
    interests: [],
  };
  let current = "header";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (current !== "header" && sections[current].length && sections[current][sections[current].length - 1] !== "") {
        sections[current].push("");
      }
      continue;
    }

    const canonical = headingMap.get(trimmed.toLowerCase().replace(/[^a-z ]/g, "").trim());
    if (canonical) {
      current = canonical;
      continue;
    }

    // Split pipe-separated header lines (e.g. "Name | City | email | phone") into
    // individual header entries so name and contact render separately.
    if (current === "header" && trimmed.includes(" | ")) {
      const parts = trimmed.split(" | ").map(p => p.trim()).filter(Boolean);
      for (const part of parts) sections.header.push(part);
      continue;
    }

    sections[current].push(trimmed);
  }

  for (const key of Object.keys(sections)) {
    if (!Array.isArray(sections[key])) continue;
    sections[key] = sections[key].filter((line, index, list) => !(line === "" && list[index - 1] === ""));
  }

  for (const key of compactListSectionKeys) {
    sections[key] = compactListSectionLines(sections[key]);
  }

  // Merge AI-wrapped bullet continuations back into the preceding bullet.
  // A continuation is a non-bullet, non-job-title line that immediately follows a bullet.
  // Job-title lines are identified by containing " | " or a 4-digit year.
  for (const key of Object.keys(sections).filter((sectionKey) => sectionKey !== "header")) {
    const merged = [];
    for (const line of sections[key]) {
      if (line && merged.length > 0) {
        const prev = merged[merged.length - 1];
        const prevIsBullet = /^[-*•]/.test(prev);
        const currIsBullet = /^[-*•]/.test(line);
        const looksLikeJobLine = line.includes(" | ") || /\b(19|20)\d{2}\b/.test(line);
        if (prevIsBullet && !currIsBullet && !looksLikeJobLine) {
          merged[merged.length - 1] = prev + " " + line;
          continue;
        }
      }
      merged.push(line);
    }
    sections[key] = merged;
  }

  return sections;
}

function exportSectionEntries(sections) {
  return [
    ["Summary", "summary"],
    ["Experience", "experience"],
    ["Skills", "skills"],
    ["Education", "education"],
    ["Projects", "projects"],
    ["Certifications", "certifications"],
    ["Licenses", "licenses"],
    ["Publications", "publications"],
    ["Research", "research"],
    ["Coursework", "coursework"],
    ["Portfolio", "portfolio"],
    ["Community", "community"],
    ["Extracurriculars", "extracurriculars"],
    ["Military Service", "military"],
    ["Professional Development", "development"],
    ["Hobbies", "hobbies"],
    ["Interests", "interests"],
    ["Languages", "languages"]
  ];
}

function estimateOnePageExportLines(sections) {
  let lines = 0;
  if (sections.header[0]) lines += 2;
  if (sections.header.slice(1).join("  |  ").trim()) lines += 1;

  for (const [, key] of exportSectionEntries(sections)) {
    const sectionLines = sections[key].filter((line) => line !== "");
    if (!sectionLines.length) continue;
    lines += 1;

    for (const line of sections[key]) {
      if (!line) {
        lines += 0.5;
        continue;
      }
      const clean = line.replace(/^[-*•]\s*/, "");
      const charsPerLine = /^[-*•]/.test(line) ? 88 : 96;
      lines += Math.max(1, Math.ceil(clean.length / charsPerLine));
    }
    lines += 0.5;
  }

  return lines;
}

function assertOnePageExportBudget(sections) {
  const estimatedLines = estimateOnePageExportLines(sections);
  if (estimatedLines > maxOnePageExportLines) {
    throw new AppError(
      "This resume is still too long for a one-page export. Shorten or remove low-signal content before downloading.",
      { status: 400 }
    );
  }
}

async function buildDocx(text) {
  const sections = parseResumeForExport(text);
  assertOnePageExportBudget(sections);
  const paragraphs = [];

  if (sections.header[0]) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: sections.header[0], bold: true, size: 26 })],
      spacing: { after: 70 }
    }));
  }

  const headerMeta = sections.header.slice(1).join("  |  ");
  if (headerMeta) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: headerMeta, color: "555555", size: 18 })],
      spacing: { after: 130 }
    }));
  }

  for (const [title, key] of exportSectionEntries(sections)) {
    const lines = sections[key].filter((line) => line !== "");
    if (!lines.length) {
      continue;
    }

    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 17, color: "6B5B4D" })],
      spacing: { before: 95, after: 45 }
    }));

    for (const line of sections[key]) {
      if (!line) {
        paragraphs.push(new Paragraph({ spacing: { after: 60 } }));
        continue;
      }

      const isBullet = /^[-*•]/.test(line);
      if (!isBullet) {
        const split = splitJobDate(line);
        if (split) {
          // Job title line: role left, date right-aligned via tab stop
          paragraphs.push(new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            children: [
              new TextRun({ text: split.role, bold: false, size: 20 }),
              new TextRun({ text: "\t" }),
              new TextRun({ text: split.date, color: "555555", size: 20 })
            ],
            spacing: { after: 50 }
          }));
        } else {
          paragraphs.push(new Paragraph({
            text: line,
            spacing: { after: 45 }
          }));
        }
      } else {
        paragraphs.push(new Paragraph({
          text: line.replace(/^[-*•]\s*/, ""),
          bullet: { level: 0 },
          spacing: { after: 32 }
        }));
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 864, right: 864 }
          }
        },
        children: paragraphs
      }
    ]
  });

  return Packer.toBuffer(doc);
}

function sanitizeForWinAnsi(str) {
  // pdf-lib's Standard fonts use WinAnsi encoding (Windows-1252).
  // Replace common Unicode typography chars that AI output may include,
  // then drop anything still outside the Latin-1 range.
  return String(str)
    .replace(/[→⇒⟶➜➡]/g, "->")
    .replace(/[←⟵⬅]/g, "<-")
    .replace(/[–—]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[…]/g, "...")
    .replace(/[•·▪▸◦]/g, "-")
    .replace(/[✓✔]/g, "v")
    .replace(/[✗✘]/g, "x")
    .replace(/[^\x00-\xFF]/g, " ");
}

async function buildPdf(text) {
  const sections = parseResumeForExport(sanitizeForWinAnsi(text));
  assertOnePageExportBudget(sections);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const lineHeight = 13;
  const margin = 46;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;
  let clipped = false;

  const ensureSpace = (required = lineHeight) => {
    if (y < margin + required) {
      clipped = true;
    }
  };

  const drawWrapped = (textValue, options = {}) => {
    if (clipped) return;
    const {
      x = margin,
      size = fontSize,
      currentFont = font,
      color = rgb(0.07, 0.11, 0.13),
      indent = 0
    } = options;
    const lines = wrapText(sanitizeForWinAnsi(textValue), currentFont, size, maxWidth - indent);
    // Compute how many complete lines fit before we run out of space.
    const available = Math.max(0, Math.floor((y - margin) / lineHeight));
    const toDraw = Math.min(lines.length, available);
    if (toDraw < lines.length) clipped = true;
    for (let i = 0; i < toDraw; i++) {
      page.drawText(lines[i], {
        x: x + indent,
        y,
        size,
        font: currentFont,
        color
      });
      y -= lineHeight;
    }
  };

  if (sections.header[0]) {
    drawWrapped(sections.header[0], {
      size: 18,
      currentFont: boldFont
    });
    y -= 3;
  }

  const headerMeta = sections.header.slice(1).join("  |  ");
  if (headerMeta) {
    drawWrapped(headerMeta, {
      size: 10,
      color: rgb(0.33, 0.33, 0.33)
    });
    y -= 8;
  }

  for (const [title, key] of exportSectionEntries(sections)) {
    const lines = sections[key].filter((line) => line !== "");
    if (!lines.length) {
      continue;
    }

    ensureSpace(lineHeight * 2);
    if (!clipped) {
      page.drawText(title.toUpperCase(), {
        x: margin,
        y,
        size: 9,
        font: boldFont,
        color: rgb(0.42, 0.35, 0.28)
      });
      y -= lineHeight;
    }

    for (const line of sections[key]) {
      if (clipped) break;
      if (!line) {
        y -= 4;
        continue;
      }
      if (/^[-*•]/.test(line)) {
        ensureSpace(lineHeight);
        if (!clipped) {
          page.drawText("•", {
            x: margin + 2,
            y,
            size: fontSize,
            font: boldFont,
            color: rgb(0.07, 0.11, 0.13)
          });
          drawWrapped(line.replace(/^[-*•]\s*/, ""), { indent: 14 });
        }
      } else {
        const split = splitJobDate(sanitizeForWinAnsi(line));
        if (split) {
          ensureSpace(lineHeight);
          if (!clipped) {
            // Role: left-aligned
            const roleLines = wrapText(split.role, font, fontSize, maxWidth * 0.72);
            page.drawText(roleLines[0] || split.role, { x: margin, y, size: fontSize, font, color: rgb(0.07, 0.11, 0.13) });
            // Date: right-aligned on the same baseline
            const dateWidth = font.widthOfTextAtSize(split.date, fontSize);
            page.drawText(split.date, { x: margin + maxWidth - dateWidth, y, size: fontSize, font, color: rgb(0.33, 0.33, 0.33) });
            y -= lineHeight;
          }
        } else {
          drawWrapped(line);
        }
      }
    }
    y -= 4;
  }

  return Buffer.from(await pdf.save());
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines = [];
  let current = words[0];

  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}
