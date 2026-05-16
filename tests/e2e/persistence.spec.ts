import { expect, test } from "./fixtures";

test.describe("Persistence", () => {
  test("workspace state survives a reload via localStorage autosave", async ({ app }) => {
    await app.loadExample();
    // Wait past the 500ms debounce so autosave fires
    await app.page.waitForTimeout(800);

    // Reload
    await app.page.reload();

    // Subject is restored (header shows its name) without going through the empty-state flow
    await expect(app.page.getByText("GCSE Physics 1PH0 (example)")).toBeVisible();
    await expect(
      app.page.getByRole("heading", { name: "Import a specification to begin" })
    ).toHaveCount(0);
  });

  test("Save writes a curriculum file via the mocked save dialog", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: "Save as…" }).click();
    await expect.poll(async () => (await app.listMockFiles()).length).toBeGreaterThan(0);
    const files = await app.listMockFiles();
    expect(files.some((p) => p.endsWith(".curriculum"))).toBe(true);
  });

  test("Export writes an .xlsx via the mocked save dialog", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: "Export" }).click();
    await expect.poll(async () => (await app.listMockFiles()).length).toBeGreaterThan(0);
    const files = await app.listMockFiles();
    expect(files.some((p) => p.endsWith(".xlsx"))).toBe(true);
  });
});
