import { test as base, expect, type Page } from "@playwright/test";

/**
 * Stub the `window.api` Electron bridge so the renderer behaves as if it
 * were inside the desktop app. File ops back onto an in-process Map so
 * save-then-reopen flows can round-trip without OS dialogs.
 *
 * Each test gets a fresh handle so dirty state doesn't leak between tests.
 */
export const test = base.extend<{ app: AppPage }>({
  app: async ({ page }, use) => {
    await installApiMock(page);
    // Playwright gives each test a fresh BrowserContext, so localStorage is
    // already empty. Don't clear in addInitScript — it would re-run on every
    // navigation and defeat reload-based persistence tests.
    await page.goto("/");
    await use(new AppPage(page));
  },
});

export { expect };

async function installApiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type StoredFile = { name: string; data: string | Uint8Array };
    const memory = new Map<string, StoredFile>();
    let lastPathCounter = 0;
    const newPath = (ext: string): string => {
      lastPathCounter += 1;
      return `mock://workspace-${lastPathCounter}.${ext}`;
    };
    interface MockApi {
      openCurriculumFile(): Promise<{ path: string; json: string } | null>;
      saveCurriculumFile(
        json: string,
        opts?: { knownPath?: string | null; defaultName?: string }
      ): Promise<{ path: string } | null>;
      openSpreadsheetFile(): Promise<{ path: string; buffer: Uint8Array } | null>;
      saveSpreadsheetFile(
        buffer: Uint8Array,
        opts?: { defaultName?: string }
      ): Promise<{ path: string } | null>;
      saveFolderOfXlsx(
        files: ReadonlyArray<{ name: string; buffer: Uint8Array }>,
        opts: { suggestedFolderName: string }
      ): Promise<{ folderPath: string; fileCount: number } | null>;
      getAppVersion(): Promise<string>;
      setDirty(dirty: boolean): Promise<void>;
    }
    const api: MockApi = {
      async openCurriculumFile() {
        // Tests preload state via __testHooks.preloadCurriculum below.
        for (const [path, file] of memory) {
          if (typeof file.data === "string") {
            return { path, json: file.data };
          }
        }
        return null;
      },
      async saveCurriculumFile(json, opts) {
        const path = opts?.knownPath ?? newPath("curriculum");
        memory.set(path, { name: opts?.defaultName ?? "workspace.curriculum", data: json });
        return { path };
      },
      async openSpreadsheetFile() {
        return null;
      },
      async saveSpreadsheetFile(buffer, opts) {
        // Honour the requested extension if defaultName supplies one (e.g.
        // .zip from the folder-as-zip export path). Real Electron defaults
        // to the suggested name; the mock mirrors that so tests can filter
        // by extension.
        const defaultName = opts?.defaultName ?? "export.xlsx";
        const extMatch = /\.([a-z0-9]+)$/i.exec(defaultName);
        const ext = extMatch ? extMatch[1]! : "xlsx";
        const path = newPath(ext);
        memory.set(path, {
          name: defaultName,
          data: new Uint8Array(buffer),
        });
        return { path };
      },
      async saveFolderOfXlsx(files, opts) {
        const folderPath = `mock://${opts.suggestedFolderName}`;
        for (const f of files) {
          memory.set(`${folderPath}/${f.name}`, { name: f.name, data: new Uint8Array(f.buffer) });
        }
        return { folderPath, fileCount: files.length };
      },
      async getAppVersion() {
        return "1.0.0-test";
      },
      async setDirty() {
        /* no-op in tests */
      },
    };
    Object.defineProperty(window, "api", { value: api, configurable: true });
    // Test-only inspection surface for asserting that mock files were written.
    Object.defineProperty(window, "__testHooks", {
      value: {
        listFiles: (): string[] => Array.from(memory.keys()),
        readFile: (path: string): string | Uint8Array | undefined => memory.get(path)?.data,
        preloadCurriculum: (path: string, json: string): void => {
          memory.set(path, { name: "preloaded.curriculum", data: json });
        },
      },
      configurable: true,
    });
  });
}

export class AppPage {
  constructor(public readonly page: Page) {}

  async loadExample(): Promise<void> {
    await this.page.getByRole("button", { name: /Or load the bundled example/i }).click();
    // Wait for the example to fetch + parse + render
    await expect(this.page.getByRole("heading", { name: "Y9" })).toBeVisible({ timeout: 15_000 });
  }

  view(name: "Topic" | "Sub-topic" | "Lesson" | "Objective") {
    return this.page.getByRole("tab", { name, exact: true });
  }

  async switchView(name: "Topic" | "Sub-topic" | "Lesson" | "Objective"): Promise<void> {
    await this.view(name).click();
  }

  async listMockFiles(): Promise<string[]> {
    return this.page.evaluate(() => (window as unknown as { __testHooks: { listFiles: () => string[] } }).__testHooks.listFiles());
  }
}
