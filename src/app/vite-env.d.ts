/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*.css";

interface Window {
  showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
