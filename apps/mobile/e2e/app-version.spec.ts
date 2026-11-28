import { expect, test } from "@playwright/test";
import appConfig from "../app.json" with { type: "json" };

test("the web app sends its version and platform and is never blocked, however high the native minimums", async ({
  page,
}) => {
  const meta = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/meta");
  await page.goto("/");
  const response = await meta;

  const headers = response.request().headers();
  expect(headers["x-app-platform"]).toBe("web");
  expect(headers["x-app-version"]).toBe(appConfig.expo.version);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ minimumVersions: { ios: "99.0.0", android: "99.0.0" } });

  await expect(page.getByTestId("home-app-name")).toHaveText("Prayer Team");
  await expect(page.getByTestId("forced-update")).toHaveCount(0);
});
