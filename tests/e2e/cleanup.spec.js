import { expect, test } from "@playwright/test";

test("legacy v2 prototype page is not served", async ({ page }) => {
  const response = await page.goto("/v2.html");

  expect(response?.status()).toBe(404);
});
