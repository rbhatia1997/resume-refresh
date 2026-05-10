/**
 * inference.js
 *
 * Pluggable model adapter. Keeps all model-specific details here so
 * the rest of the app stays model-agnostic.
 *
 * Supported providers (set INFERENCE_PROVIDER in .env):
 *
 *   openai  (default) — gpt-4.1-mini via OpenAI Responses API
 *   ollama             — any model served by a local Ollama instance
 *                        Requires: `ollama serve` running locally.
 *                        Set OLLAMA_MODEL (default: qwen2.5:7b)
 *
 * Use local models only for bounded tasks (bullet strengthening, wording
 * cleanup). Cloud models handle full rewrite and ATS tailoring.
 *
 * Usage:
 *   import { callModel, isModelConfigured, getProviderLabel } from "./inference.js";
 *   const jsonText = await callModel(systemPrompt, userPrompt);
 *   const result   = JSON.parse(jsonText);
 */

import OpenAI from "openai";

function getProvider() {
  return (process.env.INFERENCE_PROVIDER || "openai").toLowerCase().trim();
}

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || "";
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function getOpenAIVisionModel() {
  return process.env.OPENAI_VISION_MODEL || getOpenAIModel();
}

function getOllamaUrl() {
  return (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
}

function getOllamaModel() {
  return process.env.OLLAMA_MODEL || "qwen2.5:7b";
}

// Shared JSON schema for all resume rewrite actions
const REWRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary:             { type: "string" },
    rewritten_resume:    { type: "string" },
    bullet_improvements: { type: "array", items: { type: "string" } },
    notes:               { type: "array", items: { type: "string" } }
  },
  required: ["summary", "rewritten_resume", "bullet_improvements", "notes"]
};

let _openai = null;
let _openaiKey = "";
function getOpenAIClient() {
  const key = getOpenAIKey();
  if (_openai && _openaiKey === key) return _openai;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  _openai = new OpenAI({ apiKey: key });
  _openaiKey = key;
  return _openai;
}

/**
 * True if the configured provider has credentials / is reachable.
 * For ollama: returns true (checked at call time — user may not have it running yet).
 */
export function isModelConfigured() {
  if (getProvider() === "ollama") return true;
  return Boolean(getOpenAIKey());
}

/**
 * Human-readable label for the current provider (shown in /api/config).
 */
export function getProviderLabel() {
  return getProvider() === "ollama"
    ? `local/${getOllamaModel()}`
    : `openai/${getOpenAIModel()}`;
}

/**
 * Call the configured model with a system prompt and user prompt.
 * Returns a raw string that must be JSON-parseable.
 *
 * Both providers are expected to return JSON matching REWRITE_SCHEMA.
 */
export async function callModel(systemPrompt, userPrompt) {
  if (getProvider() === "ollama") {
    return callOllama(systemPrompt, userPrompt);
  }
  return callOpenAI(systemPrompt, userPrompt);
}

// ── OpenAI (cloud) ────────────────────────────────────────────────

async function callOpenAI(systemPrompt, userPrompt) {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: getOpenAIModel(),
    max_output_tokens: 2048,
    temperature: 0.2,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user",   content: [{ type: "input_text", text: userPrompt   }] }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "resume_action",
        schema: REWRITE_SCHEMA
      }
    }
  });

  return response.output_text || "{}";
}

export async function extractTextFromResumeImage({ imageBase64 = "", mimeType = "" } = {}) {
  if (getProvider() !== "openai") {
    throw new Error("Photo resume parsing requires OpenAI vision. Use PDF, TXT, or MD with the local provider.");
  }
  if (!getOpenAIKey()) {
    throw new Error("Photo resume parsing requires OPENAI_API_KEY. Add it to .env, or upload PDF, TXT, MD, or paste text instead.");
  }
  if (!imageBase64) {
    throw new Error("No resume image provided.");
  }

  const client = getOpenAIClient();
  const safeMime = mimeType || "image/jpeg";
  const response = await client.responses.create({
    model: getOpenAIVisionModel(),
    max_output_tokens: 4096,
    temperature: 0,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Extract the resume text from this image.",
            "Preserve headings, line breaks, bullet markers, dates, email, phone, links, and names.",
            "Return plain text only. Do not summarize or critique."
          ].join(" ")
        },
        {
          type: "input_image",
          image_url: `data:${safeMime};base64,${imageBase64}`,
          detail: "high"
        }
      ]
    }]
  });

  return (response.output_text || "").trim();
}

// ── Ollama (local) ────────────────────────────────────────────────
//
// Use for bounded tasks: bullet strengthening, wording cleanup.
// Not recommended for full resume rewrite (needs world knowledge + judgment).
//
// Ollama setup:
//   brew install ollama
//   ollama pull qwen2.5:7b
//   ollama serve

async function callOllama(systemPrompt, userPrompt) {
  const ollamaUrl = getOllamaUrl();
  const ollamaModel = getOllamaModel();
  // Validate that OLLAMA_URL uses a safe protocol before making any network request
  try {
    const parsed = new URL(`${ollamaUrl}/api/chat`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`OLLAMA_URL must use http or https. Got: ${parsed.protocol}`);
    }
  } catch (err) {
    throw new Error(`Invalid OLLAMA_URL "${ollamaUrl}": ${err.message}`);
  }

  const body = {
    model: ollamaModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userPrompt + [
          "",
          "IMPORTANT: Respond with valid JSON only.",
          'Return an object with exactly these keys: "summary", "rewritten_resume", "bullet_improvements" (array), "notes" (array).',
          "No markdown fences. No explanation outside the JSON object."
        ].join("\n")
      }
    ],
    format: "json",
    stream: false,
    options: { num_predict: 4096, temperature: 0.3 }
  };

  let res;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000) // 2-minute timeout for local inference
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${ollamaUrl}. ` +
      `Make sure Ollama is running: \`ollama serve\`. (${err.message})`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama returned ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.message?.content || "{}";

  // Ollama sometimes wraps JSON in markdown fences — strip them
  return content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}
