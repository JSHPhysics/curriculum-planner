import { expect, test } from "./fixtures";

test.describe("Workspace calendar settings", () => {
  test("opens via the header 📅 button, shows the LEHS defaults", async ({ app }) => {
    await app.loadExample();

    await app.page.getByRole("button", { name: /Workspace calendar settings/i }).click();
    const dialog = app.page.getByRole("dialog", { name: /Calendar settings/i });
    await expect(dialog).toBeVisible();
    // Cycle length defaults to 2 (fortnight)
    const cycleInput = dialog.locator("#cal-cycle");
    await expect(cycleInput).toHaveValue("2");
    // Y9/Y10/Y11 are pre-enabled, others aren't
    await expect(dialog.getByRole("checkbox").nth(2)).toBeChecked(); // Y9 (index 2 = 3rd year)
  });

  test("changes cycle length and saves; modal closes", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /Workspace calendar settings/i }).click();
    const dialog = app.page.getByRole("dialog", { name: /Calendar settings/i });

    await dialog.locator("#cal-cycle").fill("1");
    await dialog.getByRole("button", { name: /Save calendar/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("Reset to LEHS default clears the template", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /Workspace calendar settings/i }).click();
    const dialog = app.page.getByRole("dialog", { name: /Calendar settings/i });

    // Set a custom value first
    await dialog.locator("#cal-cycle").fill("3");
    await dialog.getByRole("button", { name: /Save calendar/i }).click();
    await expect(dialog).toBeHidden();

    // Reopen and reset; the confirm() will return true via Playwright's dialog handler
    app.page.once("dialog", (d) => void d.accept());
    await app.page.getByRole("button", { name: /Workspace calendar settings/i }).click();
    await dialog.getByRole("button", { name: /Reset to LEHS default/i }).click();
    await expect(dialog).toBeHidden();
  });
});
