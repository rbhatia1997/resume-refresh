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

  assert.match(result.rewrittenResume, /Owned onboarding improvements/);
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

test("analyzeResume returns section-scoped suggestions so guidance stays grounded", () => {
  const result = analyzeResume({
    linkedinText: "Product leader with growth, experimentation, SQL, and stakeholder management across B2B SaaS.",
    resumeText: `
Jane Doe

SUMMARY
Product leader with experience in growth, experimentation, onboarding, monetization, SQL, and stakeholder management across B2B SaaS.

EXPERIENCE
Product Manager, Atlas | 2022-2025
- Led onboarding roadmap across signup and activation

SKILLS
Communication
SQL
Storytelling

EDUCATION
University of California, Berkeley
`,
    targetRole: "Senior Product Manager"
  });

  assert.ok(Array.isArray(result.sectionSuggestions.skills));
  assert.ok(result.sectionSuggestions.skills.every((item) => item.sectionId === "skills"));
  assert.ok(result.sectionSuggestions.education.every((item) => item.sectionId === "education"));
  assert.ok(result.sectionSuggestions.education.every((item) => !item.detail.includes("stakeholder management across B2B SaaS")));
});

test("analyzeResume keeps projects and hobbies out of education", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

EDUCATION
City College
Associate Degree, Computer Science

PROJECTS
Home Lab Network
- Configured routers and POS-style peripherals

HOBBIES
Photography
`,
    targetRole: "IT Support Specialist"
  });

  const education = result.sectionEditorData.find((section) => section.id === "education");
  const projects = result.sectionEditorData.find((section) => section.id === "projects");
  const hobbies = result.sectionEditorData.find((section) => section.id === "hobbies");

  assert.ok(education.currentText.includes("City College"));
  assert.doesNotMatch(education.currentText, /Home Lab|Photography/);
  assert.ok(projects.currentText.includes("Home Lab Network"));
  assert.doesNotMatch(projects.currentText, /Photography/);
  assert.ok(hobbies.currentText.includes("Photography"));
});

test("analyzeResume splits combined projects hobbies heading out of education", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

EDUCATION
Example High School, Example City
2017 - 2022
PROJECTS / HOBBIES

Building Computers
Modding consoles / Applications
Running Community Events
DJing
`,
    targetRole: "IT Support Specialist"
  });

  const education = result.sectionEditorData.find((section) => section.id === "education");
  const projects = result.sectionEditorData.find((section) => section.id === "projects");

  assert.match(education.currentText, /Example High School/);
  assert.doesNotMatch(education.currentText, /Building Computers|DJing|PROJECTS/i);
  assert.ok(projects);
  assert.match(projects.currentText, /Building Computers/);
});

test("analyzeResume formats OCR-style experience into entries with bullets and coaching", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

EXPERIENCE
Service & Delivery Technician -
Safeway, Northern California
July 2025 - Present
Troubleshoot and resolve hardware
and software issues for retail store
systems and devices
Support installation, replacement,
and configuration of IT equipment
Sushi Chef - Mikuni, Davis
September 2021 - June 2025
Delivered customer service in fast-
paced restaurant environment
Managed order accuracy and
multitasking under pressure
`,
    targetRole: "IT Support Specialist"
  });

  const experience = result.sectionEditorData.find((section) => section.id === "experience");

  assert.match(experience.currentText, /Service & Delivery Technician - Safeway, Northern California\s+July 2025 - Present/);
  assert.match(experience.currentText, /- Troubleshoot and resolve hardware and software issues/);
  assert.match(experience.currentText, /Sushi Chef - Mikuni, Davis\s+September 2021 - June 2025/);
  assert.equal(experience.parsedFields.entries.length, 2);
  assert.ok(experience.suggestions.some((item) => item.title === "Add scope or result"));
  assert.notEqual(experience.status, "ok");
});

test("analyzeResume preserves common optional sections", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Safeway, California
2022 - Present
- Resolved POS and device issues.

EDUCATION
Example High School
2022

PUBLICATIONS
Retail Systems Troubleshooting Notes

COMMUNITY INVOLVEMENT
- Hosted local computer-building workshops
`,
    targetRole: "IT Support Specialist"
  });

  const education = result.sectionEditorData.find((section) => section.id === "education");
  const publications = result.sectionEditorData.find((section) => section.id === "publications");
  const community = result.sectionEditorData.find((section) => section.id === "community");

  assert.ok(publications);
  assert.equal(publications.label, "Publications");
  assert.match(publications.currentText, /Retail Systems Troubleshooting Notes/);
  assert.ok(community);
  assert.equal(community.label, "Community Involvement");
  assert.match(community.currentText, /Hosted local computer-building workshops/);
  assert.doesNotMatch(education.currentText, /PUBLICATIONS|COMMUNITY INVOLVEMENT|Retail Systems/i);
});

test("analyzeResume does not promote project or hobby items into section headings", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Safeway, California
2022 - Present
- Resolved POS and device issues.

EDUCATION
Example High School
2022

PROJECTS / HOBBIES
Building Computers
Modding consoles / Applications
Running Community Events
DJing
`,
    targetRole: "IT Support Specialist"
  });

  const projects = result.sectionEditorData.find((section) => section.id === "projects");

  assert.ok(projects);
  assert.equal(projects.label, "Projects");
  assert.match(projects.currentText, /Building Computers/);
  assert.match(projects.currentText, /Modding consoles \/ Applications/);
  assert.ok(!result.sectionEditorData.some((section) => section.label === "Building Computers"));
});

test("analyzeResume does not treat all-caps skills as optional section headings", () => {
  const result = analyzeResume({
    linkedinText: "",
    resumeText: `
Jane Doe
jane@example.com

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Safeway, California
2022 - Present
- Resolved POS and device issues.

SKILLS
SQL
AWS
POS Systems

EDUCATION
Example High School
2022
`,
    targetRole: "IT Support Specialist"
  });

  const skills = result.sectionEditorData.find((section) => section.id === "skills");

  assert.match(skills.currentText, /SQL/);
  assert.match(skills.currentText, /AWS/);
  assert.ok(!result.sectionEditorData.some((section) => section.label === "Sql" || section.label === "Aws"));
});
