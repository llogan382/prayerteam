import { expect, test } from "@playwright/test";

test("the home screen shows the product name fetched from /api/meta", async ({ page }) => {
  const meta = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/meta");
  await page.goto("/");
  const response = await meta;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ name: "Prayer Team" });
  await expect(page.getByTestId("home-app-name")).toHaveText("Prayer Team");
});

test("the home screen shows an error when the API fails", async ({ page }) => {
  await page.route("**/api/meta", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify({ type: "about:blank", title: "Internal Server Error", status: 500, code: "internal_error" }),
    }),
  );
  await page.goto("/");
  // 5xx is retried twice (about 3s of backoff) before the error shows.
  await expect(page.getByTestId("home-error")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("home-app-name")).toHaveCount(0);
});
