import test from "node:test";
import assert from "node:assert/strict";
import { buildSummarySuggestions, buildExperienceSuggestions, buildSkillsSuggestions } from "./section-suggestions.js";

test("buildSummarySuggestions returns optional rewrite for generic summary", () => {
  const suggestions = buildSummarySuggestions({
    currentText: "Hardworking team player looking for a new opportunity.",
    targetRole: "IT Support Specialist",
    contact: { name: "Jane Doe" },
    candidateLevel: "early-career",
    skills: ["POS Systems", "Networking", "Hardware Support"]
  });

  assert.equal(suggestions[0].applyMode, "replace-section");
  assert.match(suggestions[0].suggestedText, /IT Support/i);
  assert.doesNotMatch(suggestions[0].suggestedText, /\bI\b|\bmy\b/i);
});

test("buildExperienceSuggestions returns concise per-bullet suggestions", () => {
  const suggestions = buildExperienceSuggestions({
    entries: [{
      title: "IT Support Specialist",
      company: "Safeway",
      location: "Northern California",
      dateRange: "",
      bullets: ["Worked on installing equipment across store locations"]
    }]
  });

  assert.ok(suggestions.some((item) => item.id.includes("date")));
  assert.ok(suggestions.some((item) => item.applyMode === "replace-line"));
  assert.ok(suggestions.every((item) => !/unchanged/i.test(item.detail)));
});

test("skills suggestions use canonical casing and readable copy", () => {
  const suggestions = buildSkillsSuggestions({
    currentText: "COMMUNICATION\nsql\nrandom problem solving",
    targetRole: "IT Support Specialist",
    supportingText: "POS systems, networking, hardware troubleshooting"
  });

  assert.doesNotMatch(JSON.stringify(suggestions), /RANDOM PROBLEM SOLVING|COMMUNICATION/);
  assert.ok(suggestions.some((item) => /SQL|POS|Networking|Hardware/i.test(item.suggestedText)));
});
