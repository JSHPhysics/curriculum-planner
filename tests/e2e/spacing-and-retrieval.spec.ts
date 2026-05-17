import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Drag `source` to the centre of `target` via the multi-step pointer dance
 * dnd-kit's PointerSensor needs (4px activation threshold, then a steps-based
 * move to land on the drop zone).
 */
async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  if (!sb || !tb) throw new Error("drag boxes missing");
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2 + 10, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 20 });
  await page.mouse.up();
}

test.describe("Spacing panel + retrieval suggestions", () => {
  test("plan health panel is visible after loading the example and expands on click", async ({ app }) => {
    await app.loadExample();

    const trigger = app.page.getByRole("button", { name: /Plan health/i });
    await expect(trigger).toBeVisible();
    // Fresh import → every sub-topic is unplaced, so the "unplaced" pill is present and non-zero
    await expect(trigger).toContainText(/unplaced/i);

    // Expand the panel — details region appears with the four sections
    await trigger.click();
    await expect(app.page.locator("#spacing-panel-details")).toBeVisible();
    await expect(app.page.locator("#spacing-panel-details")).toContainText(/Unplaced/i);
    await expect(app.page.locator("#spacing-panel-details")).toContainText(/Well-spaced/i);
  });

  test("Suggest revisits button creates a retrieval block in the target cell", async ({ app }) => {
    await app.loadExample();

    // Place T2a in Y9-A1 (data-testid lets us target the cell unambiguously)
    const t2a = app.page.locator("div.touch-none", { hasText: "T2a" }).first();
    const y9a1 = app.page.getByTestId("halfterm-cell-Y9-A1");
    await dragTo(app.page, t2a, y9a1);
    await expect(y9a1.locator("div.touch-none", { hasText: "T2a" })).toBeVisible();

    // Open the retrieval suggestion popover in Y10-A1 (later than the placement)
    await app.page
      .getByRole("button", { name: /Suggest sub-topics worth revisiting in Y10 Aut 1/i })
      .click();

    // Popover shows ranked candidates; T2a should appear since it was placed earlier
    const dialog = app.page.getByRole("dialog", { name: /Suggested revisits for Y10/i });
    await expect(dialog).toBeVisible();
    const t2aCandidate = dialog.locator("label", { hasText: "T2a" }).first();
    await expect(t2aCandidate).toBeVisible();

    // Tick T2a and create the retrieval block
    await t2aCandidate.click();
    await dialog.getByRole("button", { name: /Create retrieval block/i }).click();

    // Dialog closes; Y10-A1 now contains a block with the ↺ marker referencing T2a
    await expect(dialog).toBeHidden();
    const y10a1 = app.page.getByTestId("halfterm-cell-Y10-A1");
    const retrievalBlock = y10a1.locator("div.touch-none", { hasText: "↺" }).first();
    await expect(retrievalBlock).toBeVisible();
    await expect(retrievalBlock).toContainText(/T2a/);
  });
});
