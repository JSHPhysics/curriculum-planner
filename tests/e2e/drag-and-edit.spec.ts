import { expect, test } from "./fixtures";

test.describe("Drag a block + edit it", () => {
  test("drag a sub-topic from the pool into Y9-A1 and edit it", async ({ app }) => {
    await app.loadExample();

    // Source: pool entry for T1a "Units and measurement"
    const source = app.page.locator("div.touch-none", { hasText: "T1a" }).first();
    await expect(source).toBeVisible();

    // Target: Y9-A1 cell. Pick the first half-term cell by its label "Aut 1".
    const target = app.page
      .locator("div", { has: app.page.locator("header", { hasText: "Aut 1" }) })
      .first();
    await expect(target).toBeVisible();

    // dnd-kit uses PointerSensor with activationConstraint distance: 4px, so we
    // need a deliberate multi-step mouse move that crosses the threshold.
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error("drag handles missing bounding box");

    await app.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2
    );
    await app.page.mouse.down();
    // Cross the 4px activation threshold with a small jitter first
    await app.page.mouse.move(
      sourceBox.x + sourceBox.width / 2 + 10,
      sourceBox.y + sourceBox.height / 2 + 10,
      { steps: 5 }
    );
    // Then travel to the target cell
    await app.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 20 }
    );
    await app.page.mouse.up();

    // After drop the cell should show a sub-topic placement labelled T1a.
    // Filter for the placement wrapper (`.touch-none`) so we don't match the
    // dnd-kit live region announcement that mentions "pool:T1a".
    const placement = target.locator(".touch-none", { hasText: "T1a" });
    await expect(placement).toBeVisible({ timeout: 5_000 });

    // Click the new placement to open the BlockEditModal
    await placement.click();

    // Modal should open and show the spec-natural hint we added this session
    const modal = app.page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Spec defines/i)).toBeVisible();
    await expect(modal.getByText(/lessons claimed/i).first()).toBeVisible();
  });
});
