import { expect, test } from "@playwright/test";

const reviewSeedState = {
  stage: "review",
  sourceMethod: "import",
  targetRole: "Senior Product Manager",
  linkedinUrl: "",
  linkedinText: "Product leader with growth, experimentation, SQL, and stakeholder management experience.",
  rewriteStyle: "balanced",
  activeSection: "summary",
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

  await expect(page.getByText("Import your resume. Leave with a stronger one.")).toBeVisible();
  await page.getByRole("button", { name: "View sample" }).click();
  await expect(page.getByRole("button", { name: "Try this sample" })).toBeVisible();
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Build it step by step" }).click();

  await expect(page.getByRole("heading", { name: "Make each section stronger." })).toBeVisible();
  await page.getByLabel("Target role").fill("Senior Product Manager");
  await page.getByTestId("section-tab-header").click();
  await page.getByTestId("section-editor").fill("Jane Doe\nSan Francisco, CA\njane@example.com");
  await page.getByTestId("section-tab-summary").click();
  await page.getByTestId("section-editor").fill("Product leader with growth, onboarding, and experimentation experience.");
  await page.getByTestId("section-tab-experience").click();
  await page.getByTestId("section-editor").fill(
    "Product Manager, Atlas\n- Led onboarding roadmap across signup and activation\n- Partnered with engineering and design to improve conversion"
  );
  await page.getByTestId("section-tab-skills").click();
  await page.getByTestId("section-editor").fill("Product Strategy\nAnalytics\nSQL\nExperimentation");

  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByText("Top fixes")).toBeVisible();
  await expect(page.getByTestId("resume-preview")).toContainText("Summary");

  await page.getByRole("button", { name: "Polish with AI" }).click();
  await expect(page.getByRole("button", { name: "Apply AI polish to sections" })).toBeVisible();
  await page.getByRole("button", { name: "Apply AI polish to sections" }).click();
  await expect(page.getByText("AI polish applied back into editable sections.")).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("heading", { name: "Your refreshed resume is ready." })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download DOCX" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});

test("import review stage stays editable and leads back into the builder", async ({ page }) => {
  await page.addInitScript((state) => {
    window.sessionStorage.setItem("resume_refresh_v2_state", JSON.stringify(state));
  }, reviewSeedState);

  await page.goto("/v2.html");
  await expect(page.getByRole("heading", { name: "Confirm what came in." })).toBeVisible();

  await page.getByTestId("review-summary").fill("Product leader with growth, experimentation, and analytics experience.");
  await page.getByRole("button", { name: "Continue to builder" }).click();

  await expect(page.getByRole("heading", { name: "Make each section stronger." })).toBeVisible();
  await expect(page.getByTestId("section-editor")).toContainText("Product leader with growth, experimentation, and analytics experience.");
});

test("import path presents the permissions screen and LinkedIn redirect remains wired", async ({ page, request, baseURL }) => {
  await page.goto("/v2.html");
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Bring in what you already have" }).click();

  await expect(page.getByRole("heading", { name: "Import is visible and reversible." })).toBeVisible();
  await expect(page.getByText("Will import")).toBeVisible();

  const response = await request.get(`${baseURL}/api/auth/linkedin?return_to=/v2.html`, {
    maxRedirects: 0
  });
  expect(response.status()).toBe(302);
  const redirectUrl = new URL(response.headers().location);
  expect(redirectUrl.toString()).toContain("linkedin.com/oauth/v2/authorization");
  const stateToken = redirectUrl.searchParams.get("state");
  expect(stateToken).toBeTruthy();
  const [encodedState] = stateToken.split(".");
  const decodedState = JSON.parse(Buffer.from(encodedState, "base64url").toString("utf8"));
  expect(decodedState.returnTo).toBe("/v2.html");
});

test("landing CTA and layout stay intact across target breakpoints", async ({ page }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/v2.html");
    await expect(page.getByRole("button", { name: "Start Resume Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View sample" })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  }
});

test("mobile landing and builder do not introduce obvious horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v2.html");
  await expect(page.getByRole("button", { name: "Start Resume Refresh" })).toBeVisible();
  await page.getByRole("button", { name: "Start Resume Refresh" }).click();
  await page.getByRole("button", { name: "Build it step by step" }).click();
  await expect(page.getByRole("heading", { name: "Make each section stronger." })).toBeVisible();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});
