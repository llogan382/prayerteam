import { expect, test } from "@playwright/test";

// What a shared link shows in chat apps and social sites: always the same
// generic text, never a Church's or Member's content. Link unfurlers read
// the HTML without running JavaScript, so this checks the raw response, for
// the home page and for a deep link served by the single-page fallback.
const description = "Pray for one another. Share prayer requests with your church.";

for (const path of ["/", "/teams/abc"]) {
  test(`${path} serves the generic link-preview metadata in its HTML`, async ({ page, request }) => {
    const html = await (await request.get(path)).text();
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ""));
    const meta = (attribute: string) => page.locator(`head meta[${attribute}]`);
    await expect(page).toHaveTitle("Prayer Team");
    await expect(meta('name="description"')).toHaveAttribute("content", description);
    await expect(meta('property="og:title"')).toHaveAttribute("content", "Prayer Team");
    await expect(meta('property="og:description"')).toHaveAttribute("content", description);
    await expect(meta('property="og:type"')).toHaveAttribute("content", "website");
    await expect(meta('name="twitter:card"')).toHaveAttribute("content", "summary");
  });
}
