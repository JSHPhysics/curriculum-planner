import { expect, test } from "./fixtures";

test.describe("Loading the example + switching views", () => {
  test("loads the example and lands in Sub-topic view with placed EoHTs", async ({ app }) => {
    await app.loadExample();
    // Y9-A1 cell has 1L used (the EoHT placed by default)
    await expect(app.page.getByText(/Aut 1/).first()).toBeVisible();
    // Header shows the subject name
    await expect(app.page.getByText("GCSE Physics 1PH0 (example)")).toBeVisible();
  });

  test("all four view selectors render without errors", async ({ app }) => {
    await app.loadExample();

    await app.switchView("Topic");
    await expect(app.page.getByRole("heading", { name: "Y9" })).toBeVisible();

    await app.switchView("Lesson");
    await expect(
      app.page.getByText(/Drag lessons between cells/i).first()
    ).toBeVisible();

    await app.switchView("Objective");
    // Coverage indicator is unique to Objective view
    await expect(app.page.getByText(/spec objectives mapped/i)).toBeVisible();

    await app.switchView("Sub-topic");
    await expect(app.page.getByText(/Aut 1/).first()).toBeVisible();
  });

  test("Objective view shows full coverage immediately after import", async ({ app }) => {
    await app.loadExample();
    await app.switchView("Objective");
    // After fresh import every spec objective is mapped, so the unmapped count is 0
    await expect(app.page.getByRole("button", { name: /0 unmapped/i })).toBeVisible();
  });
});
