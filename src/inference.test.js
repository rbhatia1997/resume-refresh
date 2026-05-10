import test from "node:test";
import assert from "node:assert/strict";

test("photo parsing explains the OpenAI key requirement when no key is configured", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldProvider = process.env.INFERENCE_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.INFERENCE_PROVIDER;

  try {
    const { extractTextFromResumeImage } = await import(`./inference.js?missing-key-${Date.now()}`);
    await assert.rejects(
      () => extractTextFromResumeImage({ imageBase64: "abc", mimeType: "image/jpeg" }),
      /Photo resume parsing requires OPENAI_API_KEY.*PDF, TXT, MD, or paste text/i
    );
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldProvider === undefined) delete process.env.INFERENCE_PROVIDER;
    else process.env.INFERENCE_PROVIDER = oldProvider;
  }
});

test("model configuration reads OPENAI_API_KEY after module import", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldProvider = process.env.INFERENCE_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.INFERENCE_PROVIDER;

  try {
    const { isModelConfigured, getProviderLabel } = await import(`./inference.js?lazy-env-${Date.now()}`);

    assert.equal(isModelConfigured(), false);
    process.env.OPENAI_API_KEY = "sk-test-local";
    assert.equal(isModelConfigured(), true);
    assert.equal(getProviderLabel(), "openai/gpt-4.1-mini");
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldProvider === undefined) delete process.env.INFERENCE_PROVIDER;
    else process.env.INFERENCE_PROVIDER = oldProvider;
  }
});
