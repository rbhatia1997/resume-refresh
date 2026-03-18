import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, sanitizeRewritePayloadForSection } from "./app.js";

async function readJson(response) {
  return JSON.parse(await response.text());
}

test("config only exposes AI rewrite availability", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1:3210/api/config"));
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(typeof payload.openAiRewriteEnabled, "boolean");
  assert.equal("linkedInAuthEnabled" in payload, false);
  assert.equal("requiresAppSecret" in payload, false);
});

test("invalid JSON bodies return a safe validation error", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1:3210/api/analyze", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3210",
      "content-type": "application/json"
    },
    body: "{bad json"
  }));
  const payload = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid request body.");
});

test("removed linkedin auth routes no longer expose dead backend surface", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1:3210/api/auth/linkedin"));

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not found");
});

test("non-experience rewrite payloads drop bullet-oriented trust entries", () => {
  const sanitized = sanitizeRewritePayloadForSection({
    summary: "Header cleanup",
    rewritten_resume: "Jane Doe\nSan Francisco, CA\njane@example.com",
    bullet_improvements: ["Changed bullets"],
    trust_entries: [{
      original: "- Led onboarding experiments",
      rewrite: "- Lifted activation 18%",
      what_changed: "Strengthened the bullet",
      why_stronger: "Highlights measurable impact",
      evidence_level: "structured",
      confidence_note: ""
    }],
    notes: []
  }, "header");

  assert.deepEqual(sanitized.bulletImprovements, []);
  assert.deepEqual(sanitized.trustEntries, []);
});
