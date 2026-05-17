import { expect, test } from "./fixtures";

test.describe("Export modal", () => {
  test("Export button opens modal with three radio choices", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export.*GCSE Physics 1PH0/i });
    await expect(dialog).toBeVisible();

    const radios = dialog.getByRole("radio");
    await expect(radios).toHaveCount(3);
    await expect(dialog).toContainText(/Single workbook/i);
    await expect(dialog).toContainText(/Folder by half-term/i);
    await expect(dialog).toContainText(/Folder by topic/i);

    // Cancel closes the modal without writing anything
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("Single workbook export writes a single .xlsx via the mocked save dialog", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    // Default selection is "Single workbook" — confirm via primary action
    await dialog.getByRole("button", { name: /Export…/i }).click();
    await expect(dialog).not.toBeVisible();

    // One .xlsx written to mock://
    const files = await app.listMockFiles();
    expect(files.some((f) => f.endsWith(".xlsx") && !f.includes("by half-term") && !f.includes("by topic"))).toBe(true);
  });

  test("Folder-by-half-term export writes 17 files via the mocked folder dialog", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: /Export/i });
    await dialog.getByRole("radio", { name: /Folder by half-term/i }).click();
    await dialog.getByRole("button", { name: /Choose folder…/i }).click();
    await expect(dialog).not.toBeVisible();

    const files = await app.listMockFiles();
    const folderFiles = files.filter((f) => f.includes("by half-term"));
    // Default LEHS timeline has 17 half-terms (Y9-A1..Y11-U1)
    expect(folderFiles.length).toBe(17);
    expect(folderFiles.some((f) => f.endsWith("/Y9-A1.xlsx"))).toBe(true);
    expect(folderFiles.some((f) => f.endsWith("/Y11-U1.xlsx"))).toBe(true);
  });
});
