import { expect, test } from "@playwright/test";

test("root upload accepts resume photo file types", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#resume-file");
  await expect(input).toHaveAttribute("accept", /jpg|jpeg|png|webp/);
});

test("root flow shows optional contact suggestions without blocking continue", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe

SUMMARY
Hardworking team player looking for a job.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California
- Worked on installing equipment across store locations
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await expect(page.getByRole("heading", { name: "Contact Info" })).toBeVisible();
  await expect(page.getByText("Email missing")).toBeVisible();
  await expect(page.getByText("Phone missing")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Professional Summary" })).toBeVisible();
});

test("summary and bullet suggestions can be applied without replacing unrelated sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
Hardworking team player looking for a job.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California
- Worked on installing equipment across store locations
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await expect(page.getByRole("heading", { name: "Contact Info" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Suggested summary rewrite")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.locator("#section-textarea")).toHaveValue(/IT Support/i);

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Replace weak opener")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.locator("#section-textarea")).not.toHaveValue(/Worked on installing/);
  await expect(page.locator("#section-textarea")).toHaveValue(/Installed equipment across store locations/);
});

test("final review is short and does not lead with old whole-resume action grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California | 2022 - Present
- Diagnosed and resolved hardware and software issues for retail store systems.

SKILLS
POS Systems
Networking
Hardware Support
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }

  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  await expect(page.getByText("Tighten wording")).toHaveCount(0);
  await expect(page.getByText("Improve ATS match")).toHaveCount(0);
});
