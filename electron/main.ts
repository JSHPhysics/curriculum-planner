import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

const CURRICULUM_FILTERS = [
  { name: "Curriculum file", extensions: ["curriculum"] },
];
const SPREADSHEET_FILTERS = [
  { name: "Excel spreadsheet", extensions: ["xlsx"] },
];

// Tracks whether the renderer has unsaved changes; consulted by the close
// interceptor below. Renderer pushes this via the `app:setDirty` IPC channel.
let rendererDirty = false;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#FBF7EE",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // SPEC §9.3: confirm before discarding unsaved changes. `Cancel` keeps the
  // window open; `Discard` calls win.destroy() — which bypasses the close
  // event entirely, so we don't recurse or fight Electron's already-prevented
  // close state.
  win.on("close", (event) => {
    if (!rendererDirty) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Discard unsaved changes"],
      defaultId: 0,
      cancelId: 0,
      title: "Unsaved changes",
      message: "You have unsaved changes in the workspace.",
      detail:
        "Closing now will discard them. Use File → Save (or the Save button in the header) first if you want to keep them.",
    });
    if (choice === 1) {
      win.destroy();
    }
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// ============================================================
// IPC handlers (renderer ↔ main)
// ============================================================

interface OpenCurriculumResult {
  readonly path: string;
  readonly json: string;
}

ipcMain.handle("file:openCurriculum", async (event): Promise<OpenCurriculumResult | null> => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await (win
    ? dialog.showOpenDialog(win, { filters: CURRICULUM_FILTERS, properties: ["openFile"] })
    : dialog.showOpenDialog({ filters: CURRICULUM_FILTERS, properties: ["openFile"] }));
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0]!;
  const json = await readFile(filePath, "utf8");
  return { path: filePath, json };
});

interface SaveCurriculumArgs {
  readonly json: string;
  readonly knownPath?: string | null;
  readonly defaultName?: string;
}

interface SaveCurriculumResult {
  readonly path: string;
}

ipcMain.handle(
  "file:saveCurriculum",
  async (event, args: SaveCurriculumArgs): Promise<SaveCurriculumResult | null> => {
    let targetPath = args.knownPath ?? null;
    if (!targetPath) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const dialogOpts = {
        filters: CURRICULUM_FILTERS,
        defaultPath: args.defaultName ?? "workspace.curriculum",
      };
      const result = await (win
        ? dialog.showSaveDialog(win, dialogOpts)
        : dialog.showSaveDialog(dialogOpts));
      if (result.canceled || !result.filePath) return null;
      targetPath = result.filePath;
    }
    await writeFile(targetPath, args.json, "utf8");
    return { path: targetPath };
  }
);

interface OpenSpreadsheetResult {
  readonly path: string;
  readonly buffer: Uint8Array;
}

ipcMain.handle("file:openSpreadsheet", async (event): Promise<OpenSpreadsheetResult | null> => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await (win
    ? dialog.showOpenDialog(win, { filters: SPREADSHEET_FILTERS, properties: ["openFile"] })
    : dialog.showOpenDialog({ filters: SPREADSHEET_FILTERS, properties: ["openFile"] }));
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0]!;
  const buf = await readFile(filePath);
  return { path: filePath, buffer: new Uint8Array(buf) };
});

interface SaveSpreadsheetArgs {
  readonly buffer: Uint8Array;
  readonly defaultName?: string;
}

interface SaveSpreadsheetResult {
  readonly path: string;
}

ipcMain.handle(
  "file:saveSpreadsheet",
  async (event, args: SaveSpreadsheetArgs): Promise<SaveSpreadsheetResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      filters: SPREADSHEET_FILTERS,
      defaultPath: args.defaultName ?? "curriculum-plan.xlsx",
    };
    const result = await (win
      ? dialog.showSaveDialog(win, dialogOpts)
      : dialog.showSaveDialog(dialogOpts));
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, Buffer.from(args.buffer));
    return { path: result.filePath };
  }
);

interface SaveFolderTreeArgs {
  /**
   * Suggested name of the root folder. The IPC creates `<chosen>/<suggested>`
   * and writes every entry inside. Per DEC-045.
   */
  readonly suggestedRootName: string;
  /**
   * Tree entries. Each `path` is relative to the root (forward slashes;
   * the IPC translates to OS separators). `content === undefined` ⇒ folder
   * marker; otherwise the bytes are written to the file at that path.
   * The renderer is responsible for path-safety scrubbing of segment names.
   */
  readonly entries: ReadonlyArray<{
    readonly path: string;
    readonly content?: Uint8Array;
  }>;
}

interface SaveFolderTreeResult {
  readonly rootPath: string;
  readonly entryCount: number;
}

ipcMain.handle(
  "file:saveFolderTree",
  async (event, args: SaveFolderTreeArgs): Promise<SaveFolderTreeResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      properties: ["openDirectory", "createDirectory"] as const,
      title: "Choose where to create the export folder",
    };
    const result = await (win
      ? dialog.showOpenDialog(win, { ...dialogOpts, properties: [...dialogOpts.properties] })
      : dialog.showOpenDialog({ ...dialogOpts, properties: [...dialogOpts.properties] }));
    if (result.canceled || result.filePaths.length === 0) return null;
    const parent = result.filePaths[0]!;
    const rootPath = path.join(parent, args.suggestedRootName);
    await mkdir(rootPath, { recursive: true });
    // Two-pass write: folder markers first (so mkdir -p has the right tree
    // even for branches with no leaf file), then files. Files implicitly
    // create their parent directories too via { recursive: true } on mkdir.
    for (const entry of args.entries) {
      if (entry.content !== undefined) continue;
      if (entry.path === "") continue; // root marker, already created above
      const dir = path.join(rootPath, ...entry.path.split("/"));
      await mkdir(dir, { recursive: true });
    }
    for (const entry of args.entries) {
      if (entry.content === undefined) continue;
      const filePath = path.join(rootPath, ...entry.path.split("/"));
      // Ensure the file's parent directory exists.
      const parentDir = path.dirname(filePath);
      await mkdir(parentDir, { recursive: true });
      await writeFile(filePath, Buffer.from(entry.content));
    }
    return { rootPath, entryCount: args.entries.length };
  }
);

ipcMain.handle("app:getVersion", () => app.getVersion());

ipcMain.handle("app:setDirty", (_event, dirty: boolean) => {
  rendererDirty = Boolean(dirty);
});

// ============================================================
// App lifecycle
// ============================================================

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
