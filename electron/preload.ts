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
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
};

export type CurriculumPlannerApi = typeof api;

contextBridge.exposeInMainWorld("api", api);
