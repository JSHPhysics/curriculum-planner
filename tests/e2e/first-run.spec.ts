import { expect, test } from "./fixtures";

test.describe("First-run experience", () => {
  test("empty workspace shows the three primary actions per SPEC §7.1", async ({ app }) => {
    await expect(
      app.page.getByRole("heading", { name: "Import a specification to begin" })
    ).toBeVisible();
    await expect(app.page.getByRole("button", { name: "Import .xlsx file" })).toBeVisible();
    await expect(
      app.page.getByRole("button", { name: "Download import template" })
    ).toBeVisible();
    await expect(
      app.page.getByRole("button", { name: /Or load the bundled example/i })
    ).toBeVisible();
  });

  test("Download import template writes a file via the mocked save dialog", async ({ app }) => {
    await app.page.getByRole("button", { name: "Download import template" }).click();
    await expect.poll(async () => (await app.listMockFiles()).length).toBeGreaterThan(0);
    const files = await app.listMockFiles();
    expect(files.some((p) => p.endsWith(".xlsx"))).toBe(true);
  });
});
