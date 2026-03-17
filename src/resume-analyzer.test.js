import test from "node:test";
import assert from "node:assert/strict";
import { analyzeResume } from "./resume-analyzer.js";

test("analyzeResume produces suggestions and a draft", () => {
  const result = analyzeResume({
    linkedinText: "Senior engineer building React, Node.js, AWS, analytics, and automation systems.",
    resumeText: `
Jane Doe
jane@example.com

Experience
- worked on dashboards for internal teams
- managed releases and stakeholder requests
`,
    targetRole: "Senior Software Engineer"
  });

  assert.ok(result.suggestions.length > 0);
  assert.match(result.rewrittenResume, /SUMMARY/);
  assert.match(result.rewrittenResume, /SKILLS/);
});

test("analyzeResume avoids duplicated action verbs and keeps experience formatting", () => {
  const result = analyzeResume({
    linkedinText: "Product leader with growth, experimentation, SQL, and stakeholder management experience.",
    resumeText: `
Jane Doe
San Francisco, CA

EXPERIENCE
Product Manager, Atlas
- Led onboarding roadmap across signup and activation
- Partnered with engineering and design to improve conversion
`,
    targetRole: "Senior Product Manager"
  });

  assert.match(result.rewrittenResume, /EXPERIENCE/);
  assert.match(result.rewrittenResume, /Product Manager, Atlas/);
  assert.doesNotMatch(result.rewrittenResume, /Led Led/);
  assert.doesNotMatch(result.rewrittenResume, /Partnered Partnered/);
});

test("analyzeResume handles messy alternate headings without leaking them into the header", () => {
  const result = analyzeResume({
    linkedinText: "Product leader with experimentation, SQL, and stakeholder management experience.",
    resumeText: `
Jane Doe
Remote

EXPERIENCE HIGHLIGHTS
Product Manager, Atlas
- Built onboarding flows
- Improved activation

CORE SKILLS
Product Strategy
Analytics
SQL

PROFILE
Product leader with growth experience.
`,
    targetRole: "Senior Product Manager"
  });

  assert.match(result.rewrittenResume, /SUMMARY/);
  assert.match(result.rewrittenResume, /EXPERIENCE/);
  assert.doesNotMatch(result.rewrittenResume, /Remote\nEXPERIENCE HIGHLIGHTS/);
});

test("analyzeResume flags weak bullet openers and rewrites them to stronger action verbs", () => {
  const result = analyzeResume({
    linkedinText: "Product manager with experimentation, SQL, and analytics experience.",
    resumeText: `
Jane Doe

EXPERIENCE
- Worked on onboarding improvements for new users
- Helped with executive reporting for leadership
`,
    targetRole: "Senior Product Manager"
  });

  assert.match(result.rewrittenResume, /Executed onboarding improvements/);
  assert.match(result.rewrittenResume, /Supported executive reporting/);
  assert.ok(result.suggestions.some((item) => item.title === "Replace weak bullet openers"));
  assert.ok(result.suggestions.some((item) => item.title === "Rewrite vague bullets into action and result bullets"));
  assert.ok(result.extracted.bulletQualityScore < 6);
});

test("analyzeResume detects mixed tense and missing outcomes in weaker bullet sets", () => {
  const result = analyzeResume({
    linkedinText: "Engineering manager with platform, reliability, and cross-functional delivery experience.",
    resumeText: `
Jane Doe

EXPERIENCE
- Lead sprint planning for platform work
- Built internal tooling for release coordination
- Responsible for status updates
`,
    targetRole: "Engineering Manager"
  });

  assert.ok(result.suggestions.some((item) => item.title === "Make verb tense consistent"));
  assert.ok(result.suggestions.some((item) => item.title === "Close more bullets with impact"));
  assert.ok(Array.isArray(result.lint.failingBullets));
  assert.ok(result.lint.failingBullets.length >= 1);
});
