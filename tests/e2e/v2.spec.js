import { expect, test } from "@playwright/test";

const reviewSeedState = {
  stage: "review",
  sourceMethod: "import",
  targetRole: "Senior Product Manager",
  linkedinUrl: "",
  linkedinText: "Product leader with growth, experimentation, SQL, and stakeholder management experience.",
  rewriteStyle: "balanced",
  activeSection: "summary",
  reviewSection: "header",
  sections: [
    {
      id: "header",
      title: "Header",
      prompt: "Confirm your name, contact details, and location.",
      helper: "Keep this clean and factual. No paragraphs here.",
      placeholder: "",
      required: true,
      content: "Jane Doe\nSan Francisco, CA\njane@example.com"
    },
    {
      id: "summary",
      title: "Summary",
      prompt: "Write a short profile that makes your direction clear.",
      helper: "Focus on strengths, scope, and direction. Avoid vague adjectives.",
      placeholder: "",
      required: true,
      content: "Product leader with growth and onboarding experience."
    },
    {
      id: "experience",
      title: "Experience",
      prompt: "Capture the strongest experience bullets.",
      helper: "Lead with ownership, then show outcomes, scope, or complexity.",
      placeholder: "",
      required: true,
      content: "Product Manager, Atlas\n- Led onboarding roadmap\n- Improved activation"
    },
    {
      id: "skills",
      title: "Skills",
      prompt: "List the skills or tools that support your target role.",
      helper: "Keep this tight and relevant. Think hiring manager scanability.",
      placeholder: "",
      required: false,
      content: "Product Strategy\nSQL\nExperimentation"
    },
    {
      id: "education",
      title: "Education",
      prompt: "Add education only if it helps this resume.",
      helper: "School, degree, year. Keep it concise.",
      placeholder: "",
      required: false,
      content: ""
    }
  ]
};

test("manual v2 flow runs end-to-end through draft, AI rewrite, and export", async ({ page }) => {
  await page.goto("/v2.html");

  await expect(page.getByText("Import your resume. Leave with stronger proof.")).toBeVisible();
  await page.getByRole("button", { name: "View sample" }).click();
  await expect(page.getByRole("heading", { name: "Create your first draft" })).toBeVisible();
  await expect(page.getByText("Choose target role")).toBeVisible();
  await expect(page.getByText("Add your resume")).toBeVisible();
  await expect(page.getByText("Upload resume")).toBeVisible();
  await expect(page.getByText("Paste LinkedIn text", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create first draft" })).toBeVisible();
  await expect(page.getByText("AI suggestions unlock after your first draft is created.")).toBeVisible();
  await expect(page.getByText("How this works")).toBeVisible();
  await expect(page.getByText("Section coach")).toHaveCount(0);
  await expect(page.getByLabel("Target role")).toHaveValue("Senior Product Manager");
  await page.getByRole("button", { name: "Continue to draft setup" }).click();
  await expect(page.getByText("We analyzed your resume", { exact: true })).toBeVisible();
  await expect(page.getByText("ATS safety", { exact: true })).toBeVisible();
  await expect(page.getByTestId("section-editor")).toBeVisible();
  await page.getByTestId("section-editor").fill("Product leader with growth, onboarding, and experimentation experience.");
  await page.getByTestId("section-tab-experience").click();
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
  await page.getByTestId("section-editor").fill(
    "Product Manager, Atlas\n- Led onboarding roadmap across signup and activation\n- Partnered with engineering and design to improve conversion"
  );
  await page.getByTestId("section-tab-skills").click();
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await page.getByTestId("section-editor").fill("Product Strategy\nAnalytics\nSQL\nExperimentation");
  await page.getByTestId("section-tab-summary").click();
  await page.getByRole("button", { name: "Preview summary rewrite" }).click();
  await expect(page.getByText("Suggestion preview", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply to this section" })).toBeVisible();
  await expect(page.getByText("Original", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Suggested text", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("What changed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Why this is stronger", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Apply to this section" }).click();
  await expect(page.getByText("Suggestion applied to this section.")).toBeVisible();

  await page.getByRole("button", { name: "Go to final review" }).click();
  await expect(page.getByRole("heading", { name: "Final resume preview" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download DOCX" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});

test("import review stage stays stepped and leads back into the builder", async ({ page }) => {
  await page.addInitScript((state) => {
    window.sessionStorage.setItem("resume_refresh_v2_state", JSON.stringify(state));
  }, reviewSeedState);

  await page.goto("/v2.html");
  await expect(page.getByRole("heading", { name: "Review header import" })).toBeVisible();
  await page.getByTestId("review-header").fill("Jane Doe\nSan Francisco, CA\njane@example.com");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review summary import" })).toBeVisible();
  await page.getByTestId("review-summary").fill("Product leader with growth, experimentation, and analytics experience.");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review experience import" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review skills import" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review education import" })).toBeVisible();
  await page.getByRole("button", { name: "Create first draft" }).click();

  await expect(page.getByRole("heading", { name: "Create your first draft" })).toBeVisible();
  await page.getByRole("button", { name: "Create first draft" }).click();
  await expect(page.getByText("We analyzed your resume", { exact: true })).toBeVisible();
  await expect(page.getByTestId("section-editor")).toBeVisible();
});

test("linkedin paste import path cleans messy input and routes through stepped review", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Paste LinkedIn text" }).click();

  await expect(page.getByRole("heading", { name: "Paste LinkedIn text to build your draft." })).toBeVisible();
  await expect(page.getByText("This app does not scrape LinkedIn profile data")).toBeVisible();
  await page.getByLabel("LinkedIn profile URL").fill("https://www.linkedin.com/in/janedoe");
  await page.getByLabel("Headline or About").fill("Jane Doe\nProduct leader focused on onboarding, growth, and experimentation across B2B SaaS.\nSee more");
  await page.getByLabel("Experience").fill("Super.com logo\nSenior Product Manager, Atlas\nLed onboarding experiments that improved activation.\nBuilt weekly reporting for leadership.\nEducation\nUniversity of California, Berkeley\nB.A. Economics, 2018\nConnect");
  await page.getByLabel("Skills").fill("Product Management, User-centered Design and +2 skills\nSQL\nExperimentation");
  await page.getByRole("button", { name: "Use this LinkedIn text" }).click();

  await expect(page.getByRole("heading", { name: "Review header import" })).toBeVisible();
  await expect(page.getByTestId("review-header")).toContainText("Jane Doe");
  await expect(page.getByTestId("review-header")).not.toContainText("logo");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Review summary import" })).toBeVisible();
  await expect(page.getByTestId("review-summary")).toContainText("Product leader focused on onboarding");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Review experience import" })).toBeVisible();
  await expect(page.getByTestId("review-experience")).toContainText("Led onboarding experiments");
  await expect(page.getByTestId("review-experience")).not.toContainText("University of California");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Review skills import" })).toBeVisible();
  await expect(page.getByTestId("review-skills")).toContainText("SQL");
  await expect(page.getByTestId("review-skills")).not.toContainText("and +2 skills");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Review education import" })).toBeVisible();
  await expect(page.getByTestId("review-education")).toContainText("University of California, Berkeley");
  await page.getByRole("button", { name: "Continue to draft setup" }).click();
  await expect(page.getByRole("heading", { name: "Create your first draft" })).toBeVisible();
});

test("manual path opens a blank builder without sample content", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start manually" }).click();

  await expect(page.getByRole("heading", { name: "Create your first draft" })).toBeVisible();
  await expect(page.getByLabel("Target role")).toHaveValue("");
  await expect(page.getByText("Add extra context")).toBeVisible();
  await expect(page.getByText("Upload resume")).toBeVisible();
  await expect(page.getByText("Paste LinkedIn text", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create first draft" })).toBeVisible();
  await expect(page.getByText("Section coach")).toHaveCount(0);
});

test("sample mode does not leak into a real manual start", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await expect(page.getByLabel("Target role")).toHaveValue("Senior Product Manager");

  await page.getByRole("button", { name: "Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start manually" }).click();

  await expect(page.getByLabel("Target role")).toHaveValue("");
  await expect(page.getByText("Sample resume loaded.")).toHaveCount(0);
});

test("unapplied AI suggestions do not change the draft or final review", async ({ page }) => {
  await page.route("**/api/rewrite", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Mock rewrite",
        rewrittenResume: [
          "Maya Patel",
          "San Francisco, CA",
          "maya@resumerefresh.app · linkedin.com/in/mayapatel",
          "",
          "SUMMARY",
          "AI-only rewritten summary that should not appear unless applied.",
          "",
          "EXPERIENCE",
          "Senior Product Manager, Northstar",
          "- Owned onboarding experiments across web and lifecycle email, lifting new-account activation 18% within two quarters.",
          "",
          "SKILLS",
          "Product Strategy | Experimentation | SQL",
          "",
          "EDUCATION",
          "University of California, Berkeley",
          "B.A. Economics, 2017"
        ].join("\n"),
        bulletImprovements: [],
        trustEntries: [{
          original: "Product leader focused on growth, onboarding, and monetization strategy across B2B SaaS products, with a track record of lifting activation and improving operating cadence.",
          rewrite: "AI-only rewritten summary that should not appear unless applied.",
          whatChanged: "Tightened the summary.",
          whyStronger: "Makes the direction more direct.",
          evidenceLevel: "structured",
          confidenceNote: ""
        }],
        notes: []
      })
    });
  });

  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await page.getByRole("button", { name: "Create first draft" }).click();
  await page.getByTestId("section-tab-summary").click();
  await page.getByRole("button", { name: "Rewrite this summary" }).click();

  await expect(page.getByText("Suggestion preview", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("AI-only rewritten summary that should not appear unless applied.").first()).toBeVisible();

  await page.getByRole("button", { name: "Go to final review" }).click();
  await expect(page.getByRole("heading", { name: "Final resume preview" })).toBeVisible();
  await expect(page.getByText("AI-only rewritten summary that should not appear unless applied.")).toHaveCount(0);
  await expect(page.getByText("Maya Patel", { exact: true })).toBeVisible();
});

test("section AI tips appear inline when the editor is focused", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await page.getByRole("button", { name: "Create first draft" }).click();

  await expect(page.getByText("AI tips", { exact: true })).toHaveCount(0);
  await page.getByTestId("section-editor").focus();
  await expect(page.getByText("AI tips", { exact: true })).toBeVisible();
  await expect(page.getByTestId("inline-ai-action-0")).toBeVisible();
});

test("step transitions reset scroll position to the top of the active content", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await page.getByRole("button", { name: "Create first draft" }).click();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeLessThan(8);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Go to final review" }).click();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeLessThan(8);
});

test("skills AI actions stay scoped to skills and trim weak entries", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start manually" }).click();
  await page.getByLabel("Target role").fill("Senior Product Manager");
  await page.getByTestId("linkedin-support-text").fill("Product strategy\nAnalytics\nLeadership");
  await page.getByRole("button", { name: "Create first draft" }).click();

  await page.getByTestId("section-tab-skills").click();
  await page.getByTestId("section-editor").fill("Communication\nSQL\nSQL\nExperimentation\nTeamwork");
  await page.getByTestId("section-editor").focus();

  await expect(page.getByRole("button", { name: "Trim weak skills" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Align to Senior Product Manager" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add measurable impact" })).toHaveCount(0);

  await page.getByRole("button", { name: "Trim weak skills" }).click();
  await expect(page.getByTestId("section-editor")).toHaveValue("SQL\nExperimentation");

  await page.getByRole("button", { name: "Align to Senior Product Manager" }).click();
  await expect(page.getByTestId("section-editor")).toHaveValue("Experimentation\nSQL");
});

test("rewrite suggestions stay attached to the section they were created from", async ({ page }) => {
  await page.route("**/api/rewrite", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Mock rewrite",
        rewrittenResume: [
          "Maya Patel",
          "San Francisco, CA",
          "maya@resumerefresh.app · linkedin.com/in/mayapatel",
          "",
          "SUMMARY",
          "Scoped summary rewrite.",
          "",
          "EXPERIENCE",
          "Senior Product Manager, Northstar",
          "- Owned onboarding experiments across web and lifecycle email, lifting new-account activation 18% within two quarters.",
          "",
          "SKILLS",
          "Product Strategy | Experimentation | SQL",
          "",
          "EDUCATION",
          "University of California, Berkeley",
          "B.A. Economics, 2017"
        ].join("\n"),
        bulletImprovements: [],
        trustEntries: [{
          original: "Product leader focused on growth, onboarding, and monetization strategy across B2B SaaS products, with a track record of lifting activation and improving operating cadence.",
          rewrite: "Scoped summary rewrite.",
          whatChanged: "Aligned the summary to the selected section only.",
          whyStronger: "Keeps the rewrite focused on the summary.",
          evidenceLevel: "structured",
          confidenceNote: ""
        }],
        notes: []
      })
    });
  });

  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await page.getByRole("button", { name: "Create first draft" }).click();
  await page.getByTestId("section-tab-summary").click();
  await page.getByTestId("section-editor").focus();
  await page.getByRole("button", { name: "Rewrite this summary" }).click();
  await expect(page.getByText("Suggestion preview", { exact: true }).first()).toBeVisible();

  await page.getByTestId("section-tab-skills").click();
  await expect(page.getByText("Suggestion preview", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trim weak skills" })).toBeVisible();
});

test("left rail lets users revisit available sections without breaking guided next steps", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "View sample" }).click();
  await page.getByRole("button", { name: "Create first draft" }).click();

  await expect(page.getByRole("heading", { name: "Header" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();

  await page.getByTestId("left-rail-section-header").click();
  await expect(page.getByRole("heading", { name: "Header" })).toBeVisible();

  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
});

test("skills alignment adds senior product manager skill anchors to sparse skills content", async ({ page }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start manually" }).click();
  await page.getByLabel("Target role").fill("Senior Product Manager");
  await page.getByTestId("linkedin-support-text").fill("Owned roadmap prioritization and stakeholder communication across onboarding, lifecycle, and experimentation.");
  await page.getByRole("button", { name: "Create first draft" }).click();

  await page.getByTestId("left-rail-section-skills").click();
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await page.getByTestId("section-editor").fill("Python");
  await page.getByTestId("section-editor").focus();
  await page.getByRole("button", { name: "Align to Senior Product Manager" }).click();

  await expect(page.getByTestId("section-editor")).toHaveValue(
    "Product Strategy\nRoadmapping\nPrioritization\nStakeholder Management\nExperimentation\nPython"
  );

  await page.getByRole("button", { name: "Trim weak skills" }).click();
  await expect(page.getByTestId("section-editor")).toHaveValue(
    "Product Strategy\nRoadmapping\nPrioritization\nStakeholder Management\nExperimentation"
  );
});

test("landing CTA and layout stay intact across target breakpoints", async ({ page }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/v2.html");
    await expect(page.getByRole("button", { name: "Start Resume Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View sample" })).toBeVisible();
    await expect(page.getByText("Rewrite example")).toBeVisible();
    await expect(page.getByText("Import existing material")).toBeVisible();
    await expect(page.getByText("Strengthen weak bullets")).toBeVisible();
    await expect(page.getByText("Export a cleaner draft")).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  }
});

test("mobile landing and builder do not introduce obvious horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v2.html");
  await expect(page.getByRole("button", { name: "Start Resume Refresh" })).toBeVisible();
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Start manually" }).click();
  await expect(page.getByRole("heading", { name: "Create your first draft" })).toBeVisible();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});
