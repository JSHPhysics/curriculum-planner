// Type declaration for the contextBridge'd `window.api` exposed by electron/preload.ts.
// The implementation is in `electron/preload.ts`; this declaration keeps the two
// processes' tsconfigs separate while letting renderer code type-check against the
// real shape.

export interface CurriculumPlannerApi {
  openCurriculumFile(): Promise<{ path: string; json: string } | null>;
  saveCurriculumFile(
    json: string,
    options?: { knownPath?: string | null; defaultName?: string }
  ): Promise<{ path: string } | null>;
  openSpreadsheetFile(): Promise<{ path: string; buffer: Uint8Array } | null>;
  saveSpreadsheetFile(
    buffer: Uint8Array,
    options?: { defaultName?: string }
  ): Promise<{ path: string } | null>;
  getAppVersion(): Promise<string>;
}

declare global {
  interface Window {
    readonly api: CurriculumPlannerApi;
  }
}

export {};
