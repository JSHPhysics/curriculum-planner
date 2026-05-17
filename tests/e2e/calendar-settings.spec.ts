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

  test("Calendar overview strip appears below StatusBar once a subject is loaded", async ({ app }) => {
    await app.loadExample();
    const overview = app.page.getByRole("button", { name: /Calendar overview/i });
    await expect(overview).toBeVisible();
    // Default expanded — shows the year groups
    await expect(app.page.locator("#calendar-overview-strip")).toBeVisible();
    // Y9 row label is one of the visible chips
    await expect(app.page.locator("#calendar-overview-strip")).toContainText(/Y9/i);
  });

  test("Edit calendar for this subject is reachable from the subject tab menu", async ({ app }) => {
    await app.loadExample();
    // Right-click the subject tab to open its menu
    await app.page.getByRole("button", { name: /GCSE Physics/i }).click({ button: "right" });
    const editCalendar = app.page.getByRole("button", { name: /Edit calendar for this subject/i });
    await expect(editCalendar).toBeVisible();
    await editCalendar.click();
    // Modal opens in subject scope — title reflects the subject name
    const dialog = app.page.getByRole("dialog", { name: /Calendar settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Calendar for GCSE Physics/i);
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
