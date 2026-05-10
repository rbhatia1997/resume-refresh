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

test("experience suggestions flag bullets that lack quantified scope or results", () => {
  const suggestions = buildExperienceSuggestions({
    entries: [{
      title: "Service & Delivery Technician",
      company: "Safeway",
      dateRange: "July 2025 - Present",
      bullets: [
        "Troubleshoot and resolve hardware and software issues for retail store systems and devices",
        "Support installation, replacement, and configuration of IT equipment"
      ]
    }]
  });

  assert.ok(suggestions.some((item) => item.title === "Add scope or result"));
  assert.ok(suggestions.some((item) => /volume|frequency|systems|locations|outcome/i.test(item.detail)));
});

test("experience suggestions flag tense and filler issues", () => {
  const suggestions = buildExperienceSuggestions({
    entries: [{
      title: "Sushi Chef",
      company: "Mikuni",
      dateRange: "September 2021 - June 2025",
      bullets: [
        "Manage order accuracy and multitasking under pressure",
        "Delivered customer service in a fast-paced restaurant environment"
      ]
    }]
  });

  assert.ok(suggestions.some((item) => item.title === "Fix past-role tense"));
  assert.ok(suggestions.some((item) => item.suggestedText === "Managed order accuracy and multitasking under pressure"));
  assert.ok(suggestions.some((item) => item.title === "Trim filler wording"));
});
