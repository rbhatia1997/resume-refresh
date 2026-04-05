import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillActionPreview,
  normalizeSkillLines
} from "./skills-grounding.js";

test("normalizeSkillLines keeps recognizable recruiter-facing skills and drops vague prose", () => {
  const normalized = normalizeSkillLines(`
Product Strategy
Great communicator
Storytelling
SQL
growth, experimentation, onboarding, monetization
Leadership
`);

  assert.deepEqual(normalized.accepted, [
    "Product Strategy",
    "SQL",
    "Growth Strategy",
    "Experimentation",
    "Onboarding",
    "Monetization"
  ]);
  assert.ok(normalized.rejected.some((item) => item.value === "Great communicator"));
  assert.ok(normalized.rejected.some((item) => item.value === "Leadership"));
});

test("buildSkillActionPreview aligns skills toward senior product manager work", () => {
  const preview = buildSkillActionPreview({
    action: "align",
    currentText: "Communication\nSQL\nJira\nRandom Problem Solving\nProduct Strategy",
    targetRole: "Senior Product Manager",
    supportingText: "Growth, experimentation, onboarding, monetization, analytics, stakeholder management across B2B SaaS."
  });

  assert.ok(preview.suggested.includes("Product Strategy"));
  assert.ok(preview.suggested.includes("Experimentation"));
  assert.ok(preview.suggested.includes("Stakeholder Management"));
  assert.ok(preview.removed.some((item) => item.value === "Random Problem Solving"));
});
