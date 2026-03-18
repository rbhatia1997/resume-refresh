import test from "node:test";
import assert from "node:assert/strict";

import { alignSkillsToRoleList, parseImportedSections, trimWeakSkillsList } from "./import-parser.js";

test("parseImportedSections does not mistake location lines for a person's name", () => {
  const result = parseImportedSections({
    resumeText: `
Spring, TX
alex@example.com | linkedin.com/in/alexpm

Summary
Senior product manager focused on activation, experimentation, and monetization.
`.trim()
  });

  assert.equal(result.sections.header.content.split("\n")[0], "alex@example.com | linkedin.com/in/alexpm");
  assert.equal(result.sections.header.content.includes("Spring, TX"), true);
  assert.equal(result.sections.header.content.startsWith("Spring, TX"), false);
});

test("parseImportedSections keeps wrapped bullet continuations inside the same bullet", () => {
  const result = parseImportedSections({
    resumeText: `
Experience
Senior Product Manager, Atlas
- Led onboarding experimentation across signup and activation
  resulting in an 18% lift in activation within two quarters.
- Partnered with engineering and design to simplify the first-run experience.
`.trim()
  });

  assert.match(
    result.sections.experience.content,
    /- Led onboarding experimentation across signup and activation resulting in an 18% lift in activation within two quarters\./
  );
  assert.equal(result.sections.experience.content.includes("\nresulting in"), false);
});

test("parseImportedSections strips obvious LinkedIn UI junk and classifies sections", () => {
  const result = parseImportedSections({
    linkedinUrl: "https://www.linkedin.com/in/janedoe",
    linkedinText: `
Jane Doe
Product Manager at Super.com
Super.com logo
Connect
Message
500+ followers

About
Product leader focused on onboarding, experimentation, and monetization across B2B SaaS.
See more

Experience
Product Manager
Super.com
Jan 2022 - Present
- Led onboarding experiments that improved activation 18%.

Skills
Product Management, User-centered Design and +2 skills
SQL
Experimentation

Education
University of California, Berkeley
B.A. Economics, 2018
`.trim()
  });

  assert.match(result.sections.header.content, /Jane Doe/);
  assert.doesNotMatch(result.sections.header.content, /logo|connect|message|followers/i);
  assert.match(result.sections.summary.content, /Product leader focused on onboarding/i);
  assert.match(result.sections.experience.content, /Led onboarding experiments/i);
  assert.match(result.sections.skills.content, /SQL/);
  assert.match(result.sections.education.content, /B\.A\. Economics, 2018/);
  assert.equal(result.sections.experience.content.includes("University of California"), false);
});

test("parseImportedSections keeps education separate when it appears after noisy experience text", () => {
  const result = parseImportedSections({
    linkedinText: `
Experience
Senior Product Manager, Atlas
- Owned roadmap for activation and lifecycle.
- Built KPI reporting for leadership.

Education
Stanford University
M.S. Management Science & Engineering, 2020

See more
Connect
`.trim()
  });

  assert.match(result.sections.experience.content, /Senior Product Manager, Atlas/);
  assert.match(result.sections.education.content, /Stanford University/);
  assert.equal(result.sections.experience.content.includes("Stanford University"), false);
});

test("parseImportedSections deduplicates repeated headings and weak skill chips", () => {
  const result = parseImportedSections({
    linkedinText: `
Skills
Skills
Product Strategy
Communication
Product Strategy
Leadership and +3 skills
SQL
`.trim()
  });

  assert.equal(result.sections.skills.content, "Product Strategy\nSQL");
});

test("parseImportedSections avoids dumping mixed clipboard junk into experience by default", () => {
  const result = parseImportedSections({
    linkedinText: `
Jane Doe
Open to work
Product Manager
Apply now
Easy Apply
About
Built onboarding and monetization programs across growth teams.
Job alert
Recommended for you
`.trim()
  });

  assert.match(result.sections.summary.content, /Built onboarding and monetization programs/i);
  assert.equal(result.sections.experience.content, "");
});

test("parseImportedSections infers recognizable skills from summary and experience signals", () => {
  const result = parseImportedSections({
    resumeText: `
Summary
Senior product manager with experience across experimentation, SQL, analytics, and stakeholder management.

Experience
Senior Product Manager, Atlas
- Owned roadmap prioritization and user research for onboarding.
`.trim()
  });

  assert.deepEqual(result.sections.skills.content.split("\n"), [
    "SQL",
    "Stakeholder Management",
    "Experimentation",
    "Analytics",
    "Roadmapping",
    "Prioritization",
    "User Research"
  ]);
});

test("trimWeakSkillsList keeps recognizable recruiter-facing skills only", () => {
  assert.deepEqual(
    trimWeakSkillsList("Communication\nSQL\nProduct Strategy\nTeamwork\nAnalytics"),
    ["SQL", "Product Strategy", "Analytics"]
  );
});

test("alignSkillsToRoleList prioritizes role-relevant canonical skills", () => {
  assert.deepEqual(
    alignSkillsToRoleList("SQL\nJira\nProduct Strategy\nAnalytics\nReact", "Senior Product Manager"),
    ["Product Strategy", "Roadmapping", "Prioritization", "Stakeholder Management", "Experimentation", "Analytics", "SQL", "Jira", "React"]
  );
});
