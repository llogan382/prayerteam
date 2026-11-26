import { expect, test } from "@playwright/test";

test("the home screen shows the tagline from the shared domain package", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-tagline")).toHaveText("Pray for one another");
});
