import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest, MAX_BODY_BYTES } from "./app.js";

const resumeText = `
Jane Doe
jane@example.com

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, California
2022 - Present
- Resolved POS and device issues.

SKILLS
Hardware Troubleshooting
POS Systems
`;

function analyzeRequest(address) {
  return new Request("http://127.0.0.1:3216/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": address
    },
    body: JSON.stringify({
      resumeText,
      targetRole: "IT Support Specialist"
    })
  });
}

function analyzeRequestWithHeaders(headers = {}) {
  return new Request("http://127.0.0.1:3216/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({
      resumeText,
      targetRole: "IT Support Specialist"
    })
  });
}

test("analyze and rewrite share a 10 request daily edit limit per IP", async () => {
  const address = "198.51.100.50";
  const responses = [];

  for (let index = 0; index < 10; index += 1) {
    responses.push(await handleRequest(analyzeRequest(address), { serveStatic: false }));
  }
  const blocked = await handleRequest(analyzeRequest(address), { serveStatic: false });

  assert.deepEqual(responses.map((response) => response.status), Array(10).fill(200));
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /daily edit limit/i);
});

test("concurrent analyze requests cannot exceed the daily edit budget", async () => {
  const address = "198.51.100.51";
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => handleRequest(analyzeRequest(address), { serveStatic: false }))
  );
  const statuses = responses.map((response) => response.status).sort((a, b) => a - b);

  assert.deepEqual(statuses, [
    ...Array(10).fill(200),
    429,
    429
  ].sort((a, b) => a - b));
});

test("daily edit limit prefers Vercel's client IP header over spoofable forwarded fallbacks", async () => {
  const vercelAddress = "198.51.100.60";
  const responses = [];

  for (let index = 0; index < 10; index += 1) {
    responses.push(await handleRequest(analyzeRequestWithHeaders({
      "x-vercel-forwarded-for": vercelAddress,
      "x-forwarded-for": `203.0.113.${index + 1}`
    }), { serveStatic: false }));
  }

  const blocked = await handleRequest(analyzeRequestWithHeaders({
    "x-vercel-forwarded-for": vercelAddress,
    "x-forwarded-for": "203.0.113.99"
  }), { serveStatic: false });

  assert.deepEqual(responses.map((response) => response.status), Array(10).fill(200));
  assert.equal(blocked.status, 429);
});

test("analyze response does not echo raw extracted resume text", async () => {
  const response = await handleRequest(analyzeRequest("198.51.100.52"), { serveStatic: false });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(payload, "extractedResumeText"), false);
});

test("chunked JSON bodies are rejected once they exceed the upload limit", async () => {
  const encoder = new TextEncoder();
  let sent = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (sent > MAX_BODY_BYTES + 1024) {
        controller.close();
        return;
      }
      sent += 1024;
      controller.enqueue(encoder.encode("x".repeat(1024)));
    }
  });

  const response = await handleRequest(new Request("http://127.0.0.1:3216/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.53"
    },
    body,
    duplex: "half"
  }), { serveStatic: false });

  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /payload too large/i);
});
