import { expect, test } from "@playwright/test";

test("the home screen shows the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-app-name")).toHaveText("Prayer Team");
});
