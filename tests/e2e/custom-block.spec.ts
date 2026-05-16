import { expect, test } from "./fixtures";

test.describe("Custom blocks", () => {
  test("can create a custom block via the modal and see it in the pool", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /\+ Custom/i }).click();
    await app.page.getByLabel(/Name/i).fill("Mock exam");
    await app.page.getByLabel(/Lessons/i).fill("3");
    await app.page.getByRole("button", { name: /Create/i }).click();

    // Custom block now appears in the pool sidebar
    await expect(app.page.getByText("Mock exam").first()).toBeVisible();
  });
});
