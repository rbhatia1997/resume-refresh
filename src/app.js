import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun } from "docx";
import OpenAI from "openai";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { analyzeResume } from "./resume-analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(projectRoot, "public");
const maxBodyBytes = 6 * 1024 * 1024;
const maxRewriteChars = 18000;
const rateLimits = new Map();
const require = createRequire(import.meta.url);

loadDotEnv();

const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
const modelPricing = {
  "gpt-4.1-mini": {
    inputPerMillionUsd: 0.4,
    outputPerMillionUsd: 1.6
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

class AppError extends Error {
  constructor(message, { status = 400, expose = true } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.expose = expose;
  }
}

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
        openAiRewriteEnabled: Boolean(openai)
      });
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "analyze", { limit: 20, windowMs: 60_000 });
      const body = await readJsonBody(request);
      const resolvedResumeText = await extractResumeText(body);
      const result = analyzeResume({
        linkedinText: sanitizeUserText(body.linkedinText || "", 20_000),
        linkedinUrl: sanitizeLinkedInUrl(body.linkedinUrl || ""),
        resumeText: sanitizeUserText(resolvedResumeText, 30_000),
        targetRole: sanitizeUserText(body.targetRole || "", 120)
      });

      return jsonResponse({
        ...result,
        extractedResumeText: sanitizeUserText(resolvedResumeText, 30_000)
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rewrite") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "rewrite", { limit: 8, windowMs: 60_000 });
      assertOpenAiConfigured();
      const body = await readJsonBody(request);
      const rewritten = await rewriteWithOpenAI(body);
      logOpenAiUsage(rewritten.usage, {
        endpoint: "/api/rewrite",
        style: body.style || "",
        targetRole: body.targetRole || ""
      });
      delete rewritten.usage;
      return jsonResponse(rewritten);
    }

    if (request.method === "POST" && url.pathname === "/api/export") {
      enforceSameOrigin(request);
      enforceRateLimit(request, "export", { limit: 12, windowMs: 60_000 });
      const body = await readJsonBody(request);
      return exportResume(body);
    }

    if (serveStatic) {
      return serveStaticAsset(url.pathname);
    }

    return textResponse("Not found", { status: 404 });
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error("[request_error]", error);
    }
    return jsonResponse({
      error: publicErrorMessage(error)
    }, { status: publicErrorStatus(error) });
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

function assertOpenAiConfigured() {
  if (!openai) {
    throw new AppError("AI rewrite is not available right now.", { status: 503 });
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

function getBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  return new URL(request.url).origin;
}

function sanitizeUserText(value = "", maxLength = 20_000) {
  return String(value).replace(/\0/g, "").slice(0, maxLength).trim();
}

function sanitizeLinkedInUrl(value = "") {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function publicErrorMessage(error) {
  if (error instanceof AppError && error.expose) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function publicErrorStatus(error) {
  return error instanceof AppError ? error.status : 500;
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

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) {
    throw new AppError("Payload too large. Keep uploads under 6 MB.", { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBodyBytes) {
    throw new AppError("Payload too large. Keep uploads under 6 MB.", { status: 413 });
  }
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Invalid request body.", { status: 400 });
  }
}

async function extractResumeText({ resumeText = "", resumeFileName = "", resumeFileBase64 = "" }) {
  const directText = sanitizeUserText(resumeText, 30_000);
  if (directText) {
    return directText;
  }

  if (!resumeFileBase64) {
    return "";
  }

  const buffer = Buffer.from(resumeFileBase64, "base64");
  if (buffer.byteLength > 4.5 * 1024 * 1024) {
    throw new AppError("Resume file is too large. Keep files under 4.5 MB.", { status: 413 });
  }

  const extension = path.extname(resumeFileName).toLowerCase();
  if (extension === ".pdf") {
    const pdfParse = require("pdf-parse");
    try {
      const parsed = await pdfParse(buffer);
      return sanitizeUserText(parsed.text, 30_000);
    } catch {
      throw new AppError("We could not read that PDF. Try a text-based PDF, TXT, or MD file.", { status: 400 });
    }
  }

  if ([".txt", ".md"].includes(extension)) {
    return sanitizeUserText(buffer.toString("utf8"), 30_000);
  }

  throw new AppError("Unsupported file type. Use PDF, TXT, or MD.", { status: 400 });
}

async function rewriteWithOpenAI(body) {
  const resumeText = sanitizeUserText(body.resumeText || "", 30_000);
  const linkedinText = sanitizeUserText(body.linkedinText || "", 20_000);
  const targetRole = sanitizeUserText(body.targetRole || "", 120);
  const style = sanitizeUserText(body.style || "concise", 40);
  const sectionId = sanitizeUserText(body.sectionId || "", 40);
  const actionId = sanitizeUserText(body.actionId || "", 60);

  if (!resumeText && !linkedinText) {
    throw new AppError("Provide resume or LinkedIn text first.", { status: 400 });
  }

  const sourceText = [resumeText, linkedinText].filter(Boolean).join("\n\n");
  if (sourceText.length > maxRewriteChars) {
    throw new AppError("Input is too long for AI rewrite. Trim it below 18,000 characters.", { status: 400 });
  }

  let response;
  try {
    response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are an expert resume writer following strict career-center guidance. The resume must stay ATS-safe: plain text structure, standard section titles, no tables, no columns, no text boxes, no graphics, no decorative symbols as layout, and no first-person phrasing. Every experience bullet must aim for C.A.R.: context -> action -> result. Quantify the result wherever the source supports it. Use present tense for current work and past tense for past work when the source makes that clear. Avoid filler phrasing like 'helped with', 'worked on', 'responsible for', or 'assisted with'. Never invent facts, titles, dates, or metrics. If the source does not support a result, keep the bullet truthful and concise, then note the missing impact separately."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Target role: ${targetRole || "Not provided"}\nPreferred style: ${style}\nFocus section: ${sectionId || "resume-wide cleanup"}\nRequested action: ${actionId || "general cleanup"}\n\nSource material:\n${sourceText}\n\nReturn JSON with keys: summary, rewritten_resume, bullet_improvements, trust_entries, notes.\n- summary: 1 short sentence.\n- rewritten_resume: plain text resume with sections in this order when present: SUMMARY, EXPERIENCE, SKILLS, EDUCATION.\n- Only include a section if the source actually supports it. Do not output placeholders like "Not provided", "N/A", or empty section shells.\n- Keep sections outside the focus section materially unchanged unless a minimal cleanup is required for consistency.\n- Apply the requested action only to the focus section.\n- If the action is about alignment, change emphasis and ordering for that section without inventing new facts.\n- If the action is about stronger bullets, only revise bullets inside EXPERIENCE.\n- If the action is about concise education or header cleanup, only rewrite that section.\n- Use standard section titles like SUMMARY, EXPERIENCE, SKILLS, and EDUCATION.\n- EXPERIENCE bullets must be recruiter-friendly, ATS-safe, and compact. Each bullet should answer, in one line if possible: context, what the person did, and what changed.\n- Prefer credible wording over inflated wording.\n- Keep bullets scannable, avoid first person, and use quantified results only when the source supports them.\n- bullet_improvements: an array of short before/after style guidance focused on the focus section only.\n- trust_entries: an array of 1 to 3 objects with keys original, rewrite, what_changed, why_stronger, evidence_level, confidence_note.\n- trust_entries must refer only to changes in the focus section.\n- evidence_level must be one of: grounded, structured, inferred.\n- Use grounded when the rewrite only clarifies supported source facts.\n- Use structured when the rewrite improves framing or emphasis without adding unsupported facts.\n- Use inferred only when the rewrite strengthens specificity beyond the source. If you use inferred, confidence_note must explain the missing evidence.\n- Never silently introduce a metric or concrete result unless the source supports it.\n- notes: caveats where facts, metrics, dates, or scope are missing.\nDo not use fake metrics. Do not use fluff or generic buzzwords.`
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
              trust_entries: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    original: { type: "string" },
                    rewrite: { type: "string" },
                    what_changed: { type: "string" },
                    why_stronger: { type: "string" },
                    evidence_level: {
                      type: "string",
                      enum: ["grounded", "structured", "inferred"]
                    },
                    confidence_note: { type: "string" }
                  },
                  required: ["original", "rewrite", "what_changed", "why_stronger", "evidence_level", "confidence_note"]
                }
              },
              notes: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["summary", "rewritten_resume", "bullet_improvements", "trust_entries", "notes"]
          }
        }
      }
    });
  } catch {
    throw new AppError("AI rewrite is unavailable right now. Please try again.", { status: 502 });
  }

  let payload;
  try {
    payload = JSON.parse(response.output_text || "{}");
  } catch {
    throw new AppError("AI rewrite returned an invalid response. Please try again.", { status: 502 });
  }
  const sanitized = sanitizeRewritePayloadForSection(payload, sectionId);
  return {
    ...sanitized,
    usage: buildUsageSummary(response)
  };
}

function buildUsageSummary(response) {
  const usage = response?.usage || {};
  const inputTokens = normalizeTokenCount(
    usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens
  );
  const outputTokens = normalizeTokenCount(
    usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens
  );
  const totalTokens = normalizeTokenCount(
    usage.total_tokens ?? usage.totalTokens ?? addIfNumbers(inputTokens, outputTokens)
  );
  const model = typeof response?.model === "string" ? response.model : null;
  const estimatedCostUsd = estimateModelCostUsd(model, inputTokens, outputTokens);

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd
  };
}

function normalizeTokenCount(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function addIfNumbers(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Number(a) + Number(b) : null;
}

function estimateModelCostUsd(model, inputTokens, outputTokens) {
  const pricing = lookupModelPricing(model);
  if (!pricing || !Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    return null;
  }

  const cost =
    (Number(inputTokens) / 1_000_000) * pricing.inputPerMillionUsd +
    (Number(outputTokens) / 1_000_000) * pricing.outputPerMillionUsd;

  return Number(cost.toFixed(6));
}

function lookupModelPricing(model) {
  if (!model) {
    return null;
  }

  if (modelPricing[model]) {
    return modelPricing[model];
  }

  const baseModel = Object.keys(modelPricing).find((key) => model === key || model.startsWith(`${key}-`));
  return baseModel ? modelPricing[baseModel] : null;
}

function logOpenAiUsage(usage, context = {}) {
  if (!usage) {
    console.log(`[openai] ${new Date().toISOString()} usage unavailable`);
    return;
  }

  const parts = [
    `[openai] ${new Date().toISOString()}`,
    context.endpoint || "endpoint=unknown",
    usage.model ? `model=${usage.model}` : "model=unknown",
    usage.inputTokens != null ? `input_tokens=${usage.inputTokens}` : "input_tokens=unknown",
    usage.outputTokens != null ? `output_tokens=${usage.outputTokens}` : "output_tokens=unknown",
    usage.totalTokens != null ? `total_tokens=${usage.totalTokens}` : "total_tokens=unknown",
    usage.estimatedCostUsd != null ? `estimated_cost_usd=${usage.estimatedCostUsd}` : "estimated_cost_usd=unknown"
  ];

  if (context.style) {
    parts.push(`style=${String(context.style).trim() || "unknown"}`);
  }
  if (context.targetRole) {
    parts.push(`target_role=${sanitizeUsageField(context.targetRole)}`);
  }

  console.log(parts.join(" "));
}

function sanitizeUsageField(value) {
  return String(value).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 80) || "unknown";
}

function normalizeTrustEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      original: String(entry?.original || "").trim(),
      rewrite: String(entry?.rewrite || "").trim(),
      whatChanged: String(entry?.what_changed || "").trim(),
      whyStronger: String(entry?.why_stronger || "").trim(),
      evidenceLevel: normalizeEvidenceLevel(entry?.evidence_level),
      confidenceNote: String(entry?.confidence_note || "").trim()
    }))
    .filter((entry) => entry.original && entry.rewrite && entry.whatChanged && entry.whyStronger);
}

export function sanitizeRewritePayloadForSection(payload, sectionId = "") {
  const normalizedSection = String(sectionId || "").trim().toLowerCase();
  const isExperience = normalizedSection === "experience";

  return {
    summary: payload?.summary || "",
    rewrittenResume: payload?.rewritten_resume || "",
    bulletImprovements: isExperience && Array.isArray(payload?.bullet_improvements) ? payload.bullet_improvements : [],
    trustEntries: isExperience ? normalizeTrustEntries(payload?.trust_entries) : [],
    notes: Array.isArray(payload?.notes) ? payload.notes : []
  };
}

function normalizeEvidenceLevel(value) {
  return ["grounded", "structured", "inferred"].includes(value) ? value : "structured";
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
  return new Response(buffer, {
    status: 200,
    headers: {
      ...getSecurityHeaders(contentType),
      "content-disposition": `attachment; filename="${fileName}"`
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

function withCookies(response, cookies) {
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

async function exportResume(body) {
  const text = sanitizeUserText(body.text || "", 40_000);
  const format = String(body.format || "").trim().toLowerCase();
  const fileStem = sanitizeFileStem(sanitizeUserText(body.fileName || "resume-refresh", 120));

  if (!text) {
    throw new AppError("Nothing to export yet.", { status: 400 });
  }

  if (format === "docx") {
    const buffer = await buildDocx(text);
    return binaryResponse(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${fileStem}.docx`);
  }

  if (format === "pdf") {
    const buffer = await buildPdf(text);
    return binaryResponse(buffer, "application/pdf", `${fileStem}.pdf`);
  }

  throw new AppError("Unsupported export format.", { status: 400 });
}

function sanitizeFileStem(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "resume-refresh";
}

function parseResumeForExport(text) {
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
    ["education", "education"]
  ]);

  const sections = {
    header: [],
    summary: [],
    experience: [],
    skills: [],
    education: []
  };
  let current = "header";

  for (const line of lines) {
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

    sections[current].push(trimmed);
  }

  for (const key of Object.keys(sections)) {
    sections[key] = sections[key].filter((line, index, list) => !(line === "" && list[index - 1] === ""));
  }

  return sections;
}

async function buildDocx(text) {
  const sections = parseResumeForExport(text);
  const paragraphs = [];

  if (sections.header[0]) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: sections.header[0], bold: true, size: 30 })],
      spacing: { after: 120 }
    }));
  }

  const headerMeta = sections.header.slice(1).join("  |  ");
  if (headerMeta) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: headerMeta, color: "555555", size: 20 })],
      spacing: { after: 240 }
    }));
  }

  for (const [title, key] of [
    ["Summary", "summary"],
    ["Experience", "experience"],
    ["Skills", "skills"],
    ["Education", "education"]
  ]) {
    const lines = sections[key].filter((line) => line !== "");
    if (!lines.length) {
      continue;
    }

    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 18, color: "6B5B4D" })],
      spacing: { before: 180, after: 120 }
    }));

    for (const line of sections[key]) {
      if (!line) {
        paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
        continue;
      }

      const isBullet = /^[-*•]/.test(line);
      paragraphs.push(new Paragraph({
        text: isBullet ? line.replace(/^[-*•]\s*/, "") : line,
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: isBullet ? 80 : 120 }
      }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  return Packer.toBuffer(doc);
}

async function buildPdf(text) {
  const sections = parseResumeForExport(text);
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 11;
  const lineHeight = 16;
  const margin = 54;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  const ensureSpace = (required = lineHeight) => {
    if (y < margin + required) {
      page = pdf.addPage([612, 792]);
      y = page.getHeight() - margin;
    }
  };

  const drawWrapped = (textValue, options = {}) => {
    const {
      x = margin,
      size = fontSize,
      currentFont = font,
      color = rgb(0.07, 0.11, 0.13),
      indent = 0
    } = options;
    const lines = wrapText(textValue, currentFont, size, maxWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
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
    y -= 4;
  }

  const headerMeta = sections.header.slice(1).join("  |  ");
  if (headerMeta) {
    drawWrapped(headerMeta, {
      size: 10,
      color: rgb(0.33, 0.33, 0.33)
    });
    y -= 10;
  }

  for (const [title, key] of [
    ["SUMMARY", "summary"],
    ["EXPERIENCE", "experience"],
    ["SKILLS", "skills"],
    ["EDUCATION", "education"]
  ]) {
    const lines = sections[key].filter((line) => line !== "");
    if (!lines.length) {
      continue;
    }

    ensureSpace(lineHeight * 2);
    page.drawText(title, {
      x: margin,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.42, 0.35, 0.28)
    });
    y -= lineHeight;

    for (const line of sections[key]) {
      if (!line) {
        y -= 6;
        continue;
      }
      if (/^[-*•]/.test(line)) {
        ensureSpace(lineHeight);
        page.drawText("•", {
          x: margin + 2,
          y,
          size: fontSize,
          font: boldFont,
          color: rgb(0.07, 0.11, 0.13)
        });
        drawWrapped(line.replace(/^[-*•]\s*/, ""), { indent: 14 });
      } else {
        drawWrapped(line);
      }
    }
    y -= 8;
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
