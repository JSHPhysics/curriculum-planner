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

    // Popover shows ranked candidates. Per DEC-042 the default granularity
    // is "topic" — switch to sub-topic to test the specific T2a flow.
    const dialog = app.page.getByRole("dialog", { name: /Suggested revisits for Y10/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: /^Sub-topic$/i }).click();
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

  test("clicking a retrieval block opens BlockEditModal with an editable RevisitsPicker", async ({ app }) => {
    await app.loadExample();

    // Set up: place T2a in Y9-A1, then create a retrieval block in Y10-A1 referencing T2a
    const t2a = app.page.locator("div.touch-none", { hasText: "T2a" }).first();
    const y9a1 = app.page.getByTestId("halfterm-cell-Y9-A1");
    await dragTo(app.page, t2a, y9a1);
    await expect(y9a1.locator("div.touch-none", { hasText: "T2a" })).toBeVisible();

    const suggestButton = app.page.getByRole("button", {
      name: /Suggest sub-topics worth revisiting in Y10 Aut 1/i,
    });
    await suggestButton.scrollIntoViewIfNeeded();
    await suggestButton.click();
    const suggestDialog = app.page.getByRole("dialog", { name: /Suggested revisits for Y10/i });
    // Increased timeout: the dialog has heavy initial render (candidate list +
    // weights editor) and can be slow on the first cold open in a test run.
    await expect(suggestDialog).toBeVisible({ timeout: 10_000 });
    // Switch to sub-topic granularity (DEC-042 default is topic).
    await suggestDialog.getByRole("radio", { name: /^Sub-topic$/i }).click();
    const t2aCandidate = suggestDialog.locator("label", { hasText: "T2a" }).first();
    await expect(t2aCandidate).toBeVisible();
    await t2aCandidate.click();
    await suggestDialog.getByRole("button", { name: /Create retrieval block/i }).click();
    await expect(suggestDialog).toBeHidden();

    // Now click the retrieval block to open BlockEditModal
    const y10a1 = app.page.getByTestId("halfterm-cell-Y10-A1");
    await y10a1.locator("div.touch-none", { hasText: "↺" }).first().click();

    // Edit modal opens and shows the RevisitsPicker with T2a pre-checked
    const editDialog = app.page.getByRole("dialog").last();
    await expect(editDialog).toBeVisible();
    await expect(editDialog).toContainText(/Revisits/i);
    const t2aCheckbox = editDialog.locator("label", { hasText: "T2a" }).locator("input[type='checkbox']").first();
    await expect(t2aCheckbox).toBeChecked();

    // Add T3b and save
    const t3bCheckbox = editDialog.locator("label", { hasText: "T3b" }).locator("input[type='checkbox']").first();
    await t3bCheckbox.check();
    await editDialog.getByRole("button", { name: /^Save$/ }).click();

    // The block's display name updates to include both
    await expect(y10a1.locator("div.touch-none", { hasText: "↺" }).first()).toContainText(/T3b/);
  });

  test("Suggest revisits button is also available on Lesson view cells", async ({ app }) => {
    await app.loadExample();

    await app.switchView("Lesson");
    // Lesson cells have their own testid; the suggest button is per-cell
    await expect(app.page.getByTestId("lesson-halfterm-cell-Y9-A1")).toBeVisible();
    await app.page
      .getByRole("button", { name: /Suggest sub-topics worth revisiting in Y9 Aut 1/i })
      .first()
      .click();
    // Opening the popover with no prior placements simply shows "Nothing to revisit yet…"
    const dialog = app.page.getByRole("dialog", { name: /Suggested revisits for Y9/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Nothing to revisit yet/i);
  });

  test("Tuning a spacing threshold re-evaluates the flags live", async ({ app }) => {
    await app.loadExample();

    // Place 3 lessons of T2a in Y9-A1 — under the default blocked-cell minimum (4)
    const t2a = app.page.locator("div.touch-none", { hasText: "T2a" }).first();
    const y9a1 = app.page.getByTestId("halfterm-cell-Y9-A1");
    await dragTo(app.page, t2a, y9a1);
    await expect(y9a1.locator("div.touch-none", { hasText: "T2a" })).toBeVisible();

    // Open Plan health
    await app.page.getByRole("button", { name: /Plan health/i }).click();
    const details = app.page.locator("#spacing-panel-details");
    await expect(details).toBeVisible();
    // Switch to sub-topic granularity to test blocked-cells (a sub-topic
    // concept). Default per DEC-042 is topic granularity, which has a
    // "Clustered topics" section instead of "Blocked cells".
    await details.getByRole("radio", { name: /^Sub-topic$/i }).click();
    // No blocked cells at default thresholds (only 3 lessons in Y9-A1)
    await expect(details).toContainText(/No cells dominated by a single topic/i);

    // Open the thresholds editor, drag the "Blocked-cell minimum lessons" slider down to 2
    await details.getByRole("group").or(details).getByText(/Tune thresholds for this subject/i).click();
    const slider = details.getByRole("slider", { name: /Blocked-cell minimum lessons/i });
    await slider.fill("2"); // input[type=range].fill works as setValue

    // The "Blocked cells" section now lists Y9-A1 as flagged
    await expect(details.getByRole("button", { name: /Y9-A1 · T2/i })).toBeVisible();
  });

  test("Plan health defaults to topic granularity (DEC-042) and surfaces topic-level sections", async ({ app }) => {
    await app.loadExample();
    await app.page.getByRole("button", { name: /Plan health/i }).click();
    const details = app.page.locator("#spacing-panel-details");
    await expect(details).toBeVisible();

    // The granularity radiogroup is present with Topic selected by default
    const topicRadio = details.getByRole("radio", { name: /^Topic$/ });
    const subTopicRadio = details.getByRole("radio", { name: /^Sub-topic$/ });
    await expect(topicRadio).toHaveAttribute("aria-checked", "true");
    await expect(subTopicRadio).toHaveAttribute("aria-checked", "false");

    // Topic-level sections render their specific copy
    await expect(details).toContainText(/Topics appearing in only one half-term/i);
    await expect(details).toContainText(/Clustered topics/i);
    await expect(details).toContainText(/Topics whose every placement sits in consecutive half-terms/i);

    // Flip to sub-topic — see sub-topic sections (e.g. blocked cells)
    await subTopicRadio.click();
    await expect(details).toContainText(/No cells dominated by a single topic/i);
  });

  test("SpacingPanel expanded state persists across a reload", async ({ app }) => {
    await app.loadExample();
    const trigger = app.page.getByRole("button", { name: /Plan health/i });
    await trigger.click();
    await expect(app.page.locator("#spacing-panel-details")).toBeVisible();

    // Wait past the workspace-autosave debounce (500ms) so the subject
    // restores after reload; the panel's expanded state is written
    // synchronously on toggle, no debounce needed for that.
    await app.page.waitForTimeout(800);
    await app.page.reload();
    // Subject is restored AND the panel comes up expanded because of localStorage
    await expect(app.page.locator("#spacing-panel-details")).toBeVisible();
  });
});
