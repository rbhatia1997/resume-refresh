import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResumeValidation,
  buildResumeValidationFromText
} from "./resume-validator.js";

test("buildResumeValidation blocks final review when required structure is missing", () => {
  const result = buildResumeValidation([
    {
      id: "header",
      title: "Header",
      required: true,
      content: "Jane Doe\njane@example.com"
    },
    {
      id: "summary",
      title: "Summary",
      required: true,
      content: "Product leader with growth experience."
    },
    {
      id: "experience",
      title: "Experience",
      required: true,
      content: "Senior Product Manager, Atlas\n- Led onboarding roadmap"
    },
    {
      id: "skills",
      title: "Skills",
      required: false,
      content: "Product Strategy\nSQL"
    },
    {
      id: "education",
      title: "Education",
      required: false,
      content: ""
    }
  ]);

  assert.ok(result.blockingIssues.some((issue) => issue.id === "experience-dates"));
  assert.equal(result.atsChecks.find((check) => check.id === "ats-dates")?.status, "fail");
});

test("buildResumeValidationFromText supports non-traditional but valid sections", () => {
  const result = buildResumeValidationFromText(`
Jane Doe
San Francisco, CA | jane@example.com

SUMMARY
Senior product manager with growth and experimentation experience.

EXPERIENCE
Senior Product Manager, Atlas | 2022-2025
- Led onboarding roadmap across activation and lifecycle email.

SKILLS
Product Strategy | Experimentation | SQL

PROJECTS
Creator, Metrics Lab | 2023
- Built a product analytics side project for funnel diagnostics.

INTERESTS
Distance running

CERTIFICATIONS
Pragmatic Product Management
`);

  assert.equal(result.blockingIssues.length, 0);
  assert.equal(result.atsChecks.find((check) => check.id === "ats-dates")?.status, "pass");
  assert.ok(result.presentSections.includes("projects"));
  assert.ok(result.presentSections.includes("interests"));
  assert.ok(result.presentSections.includes("certifications"));
});
