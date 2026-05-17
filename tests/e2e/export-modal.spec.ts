import { expect, test } from "./fixtures";

test.describe("Export modal (DEC-045)", () => {
  test("Export button opens modal with two top-level modes", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export.*GCSE Physics 1PH0/i });
    await expect(dialog).toBeVisible();

    // Top-level radios: Single workbook + Folder structure
    await expect(dialog).toContainText(/Single workbook/i);
    await expect(dialog).toContainText(/Folder structure/i);

    // Cancel closes the modal
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("Single workbook export writes a single .xlsx", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    // Default selection is "Single workbook" — confirm via primary action
    await dialog.getByRole("button", { name: /Export…/i }).click();
    await expect(dialog).not.toBeVisible();

    const files = await app.listMockFiles();
    expect(files.some((f) => f.endsWith(".xlsx") && !f.endsWith(".zip"))).toBe(true);
  });

  test("Folder structure → zip (default) writes a single .zip", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    await dialog.getByRole("radio", { name: /Folder structure/i }).click();
    // Zip is the default output for folder mode; primary action label flips.
    await dialog.getByRole("button", { name: /Save zip…/i }).click();
    await expect(dialog).not.toBeVisible();

    const files = await app.listMockFiles();
    const zipFiles = files.filter((f) => f.endsWith(".zip"));
    expect(zipFiles.length).toBe(1);
  });

  test("Folder structure → loose folder writes nested entries via saveFolderTree", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    await dialog.getByRole("radio", { name: /Folder structure/i }).click();
    // Flip output to "Folder on disk"
    await dialog.getByRole("radio", { name: /Folder on disk/i }).click();
    await dialog.getByRole("button", { name: /Choose folder…/i }).click();
    await expect(dialog).not.toBeVisible();

    // The mock stores tree entries as `mock://<root>/<entry path>`. Every
    // visible HT should have a folder entry written.
    const files = await app.listMockFiles();
    const treeEntries = files.filter((f) => f.startsWith("mock://"));
    expect(treeEntries.some((f) => f.includes("by half-term/Y9 Aut 1"))).toBe(true);
    expect(treeEntries.some((f) => f.includes("by half-term/Y11 Sum 1"))).toBe(true);
  });

  test("Folder structure → by topic grouping (sub-radio)", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    await dialog.getByRole("radio", { name: /Folder structure/i }).click();
    // Flip grouping to By topic + output to folder
    await dialog.getByRole("radio", { name: /By topic/i }).click();
    await dialog.getByRole("radio", { name: /Folder on disk/i }).click();
    await dialog.getByRole("button", { name: /Choose folder…/i }).click();
    await expect(dialog).not.toBeVisible();

    const files = await app.listMockFiles();
    expect(files.some((f) => f.includes("by topic/"))).toBe(true);
    // With nothing placed by the user, only the root + customs (EoHT tests)
    // get a topic-mode tree. The auto-seeded EoHT customs land under "Other blocks".
    expect(files.some((f) => f.includes("by topic/Other blocks"))).toBe(true);
  });
});
