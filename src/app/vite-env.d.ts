/// <reference types="vite/client" />

declare module "*.css";

interface Window {
  showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
