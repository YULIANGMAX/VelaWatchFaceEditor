/**
 * 跨浏览器文件系统能力探测与降级工具
 */

export function isNativeFileSystemSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export interface VirtualFileEntry {
  path: string;
  file: File;
}

/**
 * 将 HTML5 input[webkitdirectory] 选取的 FileList 转换为标准虚拟文件条目列表
 */
export function parseWebkitDirectoryFileList(files: FileList | File[]): VirtualFileEntry[] {
  const result: VirtualFileEntry[] = [];
  const list = Array.from(files);

  for (const file of list) {
    // webkitRelativePath 格式通常为 "FolderName/resources/images/bg.png"
    const relative = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
    // 去掉最外层用户选中的根目录名，保留相对于项目根的相对路径
    const parts = relative.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length > 1) {
      parts.shift(); // 移除最外层根文件夹名称
    }
    const cleanPath = parts.join("/");
    result.push({ path: cleanPath, file });
  }

  return result;
}
