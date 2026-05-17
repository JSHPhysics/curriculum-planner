import { expect, test } from "./fixtures";

test.describe("Preset layouts", () => {
  test("Preset picker opens, lists three layouts, and Cancel closes without changes", async ({ app }) => {
    await app.loadExample();

    // No sub-topic placements yet — fresh import
    const initialEmpty = await countSubTopicPlacements(app.page);
    expect(initialEmpty).toBe(0);

    // Open the picker via the StatusBar button
    await app.page.getByRole("button", { name: /Preset layout/i }).click();
    const dialog = app.page.getByRole("dialog", { name: /Apply a preset layout/i });
    await expect(dialog).toBeVisible();

    // All three presets are listed
    const radios = dialog.getByRole("radio");
    await expect(radios).toHaveCount(3);
    await expect(dialog).toContainText(/Three-spiral/i);
    await expect(dialog).toContainText(/Frontloaded/i);
    await expect(dialog).toContainText(/interleaved/i);

    // Cancel — dialog closes and timeline is untouched
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(await countSubTopicPlacements(app.page)).toBe(0);
  });

  test("Applying a preset lays out placements across the timeline", async ({ app }) => {
    await app.loadExample();

    // Initially 0 sub-topic placements
    expect(await countSubTopicPlacements(app.page)).toBe(0);

    // Open picker, leave the default selection (three-spiral), confirm
    await app.page.getByRole("button", { name: /Preset layout/i }).click();
    const dialog = app.page.getByRole("dialog", { name: /Apply a preset layout/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Apply Three-spiral/i }).click();
    await expect(dialog).not.toBeVisible();

    // Placements have appeared — at least one per cell on average. The demo
    // spec has 33 sub-topics × 3 passes = ~99 placements (minus a few small
    // ones that emit fewer passes). Lower-bound the count generously.
    const after = await countSubTopicPlacements(app.page);
    expect(after).toBeGreaterThan(30);
  });

  test("Switching presets and re-confirming replaces the previous layout", async ({ app }) => {
    await app.loadExample();

    // Apply three-spiral
    await app.page.getByRole("button", { name: /Preset layout/i }).click();
    let dialog = app.page.getByRole("dialog", { name: /Apply a preset layout/i });
    await dialog.getByRole("button", { name: /Apply Three-spiral/i }).click();
    const spiralCount = await countSubTopicPlacements(app.page);
    expect(spiralCount).toBeGreaterThan(30);

    // Re-open picker — should warn about existing placements being wiped
    await app.page.getByRole("button", { name: /Preset layout/i }).click();
    dialog = app.page.getByRole("dialog", { name: /Apply a preset layout/i });
    await expect(dialog).toContainText(/will be wiped/i);

    // Apply Frontloaded
    await dialog.getByRole("radio", { name: /Frontloaded/i }).click();
    await dialog.getByRole("button", { name: /Apply Frontloaded/i }).click();
    const frontCount = await countSubTopicPlacements(app.page);
    // Frontloaded is single-pass so count should be lower than three-spiral
    expect(frontCount).toBeGreaterThan(0);
    expect(frontCount).toBeLessThan(spiralCount);
  });
});

async function countSubTopicPlacements(page: import("@playwright/test").Page): Promise<number> {
  // Count Block components inside half-term cells, excluding EoHT blocks
  // (which use `border-dashed` per Block.tsx). Custom blocks are solid-bordered
  // but rare in this test setup; we accept counting them if present.
  return page.evaluate(() => {
    const cells = document.querySelectorAll('[data-testid^="halfterm-cell-"]');
    let count = 0;
    for (const cell of cells) {
      const draggables = cell.querySelectorAll(".touch-none");
      for (const dr of draggables) {
        // Skip if this draggable contains a `.border-dashed` element (EoHT)
        if (dr.querySelector(".border-dashed")) continue;
        if (dr.classList.contains("border-dashed")) continue;
        count++;
      }
    }
    return count;
  });
}
