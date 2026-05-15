import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

const CURRICULUM_FILTERS = [
  { name: "Curriculum file", extensions: ["curriculum"] },
];
const SPREADSHEET_FILTERS = [
  { name: "Excel spreadsheet", extensions: ["xlsx"] },
];

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

ipcMain.handle("app:getVersion", () => app.getVersion());

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
