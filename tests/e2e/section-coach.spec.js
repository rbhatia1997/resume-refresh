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

test("contact step can add optional LinkedIn and GitHub profile fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, Northern California | Summer 2022
- Installed equipment across store locations
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await expect(page.getByRole("heading", { name: "Contact Info" })).toBeVisible();
  await expect(page.getByText("Add LinkedIn", { exact: true })).toBeVisible();
  await expect(page.getByText("Add GitHub", { exact: true })).toBeVisible();
  await page.locator(".suggestion-card").filter({ hasText: "Add GitHub" }).getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("#section-textarea")).toHaveValue(/GitHub: https:\/\/github\.com\/your-handle/);
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

test("OCR-style pasted resume gets structured experience, skills coaching, and final notes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
Service & Delivery Technician -
Example Retail, Northern California
July 2025 - Present
Troubleshoot and resolve hardware
and software issues for retail store
systems and devices
Support installation, replacement,
and configuration of IT equipment
Sushi Chef - Example Restaurant, Davis
September 2021 - June 2025
Delivered customer service in fast-
paced restaurant environment
Managed order accuracy and
multitasking under pressure

SKILLS
Hardware Troubleshooting
Software Troubleshooting
Device Deployment
Customer Support
Network Troubleshooting
ServiceNow
Initiative

EDUCATION
Example High School, Example City
2017 - 2022
PROJECTS / HOBBIES

Building Computers
DJing
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await expect(page.getByRole("heading", { name: "Contact Info" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
  await expect(page.locator("#section-textarea")).toHaveValue(/Service & Delivery Technician - Example Retail, Northern California\s+July 2025 - Present/);
  await expect(page.locator("#section-textarea")).toHaveValue(/- Troubleshoot and resolve hardware and software issues/);
  const sushiPreview = page.locator(".experience-preview-entry", { hasText: "Sushi Chef - Example Restaurant, Davis" });
  await expect(sushiPreview.locator(".experience-preview-date")).toHaveText("September 2021 - June 2025");
  await expect(page.getByText("Add scope or result").first()).toBeVisible();
  await expect(page.getByText("Trim filler wording").first()).toBeVisible();

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(page.getByText("Clean up skills")).toBeVisible();

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Education" })).toBeVisible();
  await expect(page.locator("#section-textarea")).not.toHaveValue(/Building Computers|DJing/);

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.locator("#section-textarea")).toHaveValue(/Building Computers/);

  await page.getByRole("button", { name: /Finish/ }).click();
  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  await expect(page.getByText("No major issues detected.")).toHaveCount(0);
  await expect(page.getByText("Add scope or result").first()).toBeVisible();
});

test("experience coach stays compact and addressed suggestions disappear", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
Service & Delivery Technician -
Example Retail, Northern California
July 2025 - Present
Troubleshoot and resolve hardware
and software issues for retail store
systems and devices
Support installation, replacement,
and configuration of IT equipment
Sushi Chef - Example Restaurant, Davis
September 2021 - June 2025
Delivered customer service in fast-
paced restaurant environment
Managed order accuracy and
multitasking under pressure
Assisted with kitchen preparation and
team coordination

SKILLS
Hardware Troubleshooting
Software Troubleshooting
Device Deployment

EDUCATION
Example High School
2022
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  const cards = page.locator(".suggestion-card");
  await expect(page.getByText(/Showing 3 of \d+ suggestions/)).toBeVisible();
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Show \d+ more/ })).toBeVisible();

  const trimCard = page.locator(".suggestion-card", { hasText: "Trim filler wording" }).first();
  await trimCard.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("#section-textarea")).toHaveValue(/Delivered customer service in a fast-paced restaurant/);
  await expect(page.getByText("Before: Delivered customer service in fast-paced restaurant environment")).toHaveCount(0);
  await expect(cards).toHaveCount(3);

  await cards.first().getByRole("button", { name: "Mark addressed" }).click();
  await expect(page.getByText(/Showing 3 of \d+ suggestions/)).toBeVisible();
  await expect(cards).toHaveCount(3);

  await page.getByRole("button", { name: /Show \d+ more/ }).click();
  await expect(page.getByRole("button", { name: "Show fewer" })).toBeVisible();
  await expect.poll(() => cards.count()).toBeGreaterThan(3);
});

test("common optional resume sections are preserved as editable steps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.locator("#resume-text").fill(`
Jane Doe
jane@example.com
(415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, California
2022 - Present
- Resolved POS and device issues.

SKILLS
Hardware Troubleshooting
Device Deployment

EDUCATION
Example High School
2022

PUBLICATIONS
Retail Systems Troubleshooting Notes

COMMUNITY INVOLVEMENT
- Hosted local computer-building workshops
`);
  await page.locator("#target-role").fill("IT Support Specialist");
  await page.getByRole("button", { name: "Analyze my resume" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Publications" })).toBeVisible();
  await expect(page.locator("#section-textarea")).toHaveValue(/Retail Systems Troubleshooting Notes/);
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("heading", { name: "Community Involvement" })).toBeVisible();
  await expect(page.locator("#section-textarea")).toHaveValue(/Hosted local computer-building workshops/);
  await page.getByRole("button", { name: /Finish/ }).click();

  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  await expect(page.locator("#final-draft")).toContainText("PUBLICATIONS");
  await expect(page.locator("#final-draft")).toContainText("Retail Systems Troubleshooting Notes");
  await expect(page.locator("#final-draft")).toContainText("COMMUNITY INVOLVEMENT");
});

test("export buttons show progress and completion feedback", async ({ page }) => {
  await page.route("**/api/export", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="resume.pdf"'
      },
      body: "fake-pdf"
    });
  });

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

  await page.getByRole("button", { name: "PDF" }).click();
  await expect(page.getByText("Preparing PDF...")).toBeVisible();
  await expect(page.getByText("PDF ready. Check your downloads.")).toBeVisible();
});
