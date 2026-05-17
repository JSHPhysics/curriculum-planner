import { contextBridge, ipcRenderer } from "electron";

const api = {
  openCurriculumFile: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke("file:openCurriculum"),
  saveCurriculumFile: (
    json: string,
    options?: { knownPath?: string | null; defaultName?: string }
  ): Promise<{ path: string } | null> =>
    ipcRenderer.invoke("file:saveCurriculum", {
      json,
      knownPath: options?.knownPath ?? null,
      defaultName: options?.defaultName,
    }),
  openSpreadsheetFile: (): Promise<{ path: string; buffer: Uint8Array } | null> =>
    ipcRenderer.invoke("file:openSpreadsheet"),
  saveSpreadsheetFile: (
    buffer: Uint8Array,
    options?: { defaultName?: string }
  ): Promise<{ path: string } | null> =>
    ipcRenderer.invoke("file:saveSpreadsheet", {
      buffer,
      defaultName: options?.defaultName,
    }),
  saveFolderTree: (
    entries: ReadonlyArray<{ path: string; content?: Uint8Array }>,
    options: { suggestedRootName: string }
  ): Promise<{ rootPath: string; entryCount: number } | null> =>
    ipcRenderer.invoke("file:saveFolderTree", {
      entries,
      suggestedRootName: options.suggestedRootName,
    }),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  setDirty: (dirty: boolean): Promise<void> =>
    ipcRenderer.invoke("app:setDirty", dirty),
};

export type CurriculumPlannerApi = typeof api;

contextBridge.exposeInMainWorld("api", api);
