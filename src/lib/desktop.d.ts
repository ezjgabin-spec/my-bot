export type DesktopSettings = {
  hasKey: boolean;
  model: string;
  startAtLogin: boolean;
  encryptionAvailable: boolean;
  startupAvailable: boolean;
};
declare global {
  interface Window {
    studyDesktop?: {
      settings(): Promise<DesktopSettings>;
      save(settings: {
        apiKey?: string;
        removeKey?: boolean;
        model: string;
        startAtLogin: boolean;
      }): Promise<DesktopSettings>;
      openData(): Promise<void>;
      openKeys(): Promise<void>;
    };
  }
}
