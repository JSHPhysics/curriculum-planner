import { expect, test } from "./fixtures";

test.describe("Custom blocks", () => {
  test("can create a custom block via the modal and see it in the pool", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /\+ Custom/i }).click();
    await app.page.getByLabel(/^Name/i).fill("Mock exam");
    await app.page.getByLabel(/Lessons/i).fill("3");
    await app.page.getByRole("button", { name: /Create/i }).click();

    // Custom block now appears in the pool sidebar
    await expect(app.page.getByText("Mock exam").first()).toBeVisible();
  });

  test("CustomBlockModal exposes the six DEC-044 categories + optional label field", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /\+ Custom/i }).click();
    const dialog = app.page.getByRole("dialog");
    // All six categories present
    for (const label of ["Test", "Lesson", "Unit", "Assessment", "Retrieval", "Other"]) {
      await expect(dialog.getByRole("radio", { name: new RegExp(label) })).toBeVisible();
    }
    // The label field is optional and labelled
    await expect(dialog.getByLabel(/Label/i)).toBeVisible();

    // Picking "Test" updates the modal headline
    await dialog.getByRole("radio", { name: /Test/ }).first().click();
    await expect(dialog.getByText(/New test block/i)).toBeVisible();
  });

  test("loaded example auto-seeds an end-of-HT test custom in every cell (DEC-044)", async ({ app }) => {
    await app.loadExample();
    // The auto-seeded "End of half-term test" custom block exists in every
    // half-term cell. Find at least one via its lesson-view rendering.
    await app.switchView("Lesson");
    await expect(
      app.page.getByRole("button", { name: /End of half-term test/i }).first()
    ).toBeVisible();
  });
});
