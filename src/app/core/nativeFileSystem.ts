/**
 * Tauri 桌面端原生文件系统桥接与适配器
 * 实现标准 FileSystemDirectoryHandle 与 FileSystemFileHandle 接口规范，
 * 使得现有的表盘工程 I/O、资源管理等模块能零改造直接在桌面端运行，并提供真实操作系统绝对物理路径。
 */

export interface NativeDirEntry {
  name: string;
  is_dir: boolean;
  is_file: boolean;
  size: number;
  modified_ms: number;
}

export interface PathExistsResult {
  exists: boolean;
  is_dir: boolean;
}

/**
 * 判断当前是否运行在 Tauri 桌面端
 */
export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as Record<string, unknown>;
  return Boolean(win.__TAURI_INTERNALS__ || win.__TAURI__);
}

/**
 * 调用 Tauri 后端 command
 */
export async function invokeTauri<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const win = typeof window !== "undefined" ? (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> };
    __TAURI__?: { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> } };
  }) : undefined;

  if (win?.__TAURI_INTERNALS__?.invoke) {
    return win.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  if (win?.__TAURI__?.core?.invoke) {
    return win.__TAURI__.core.invoke(cmd, args);
  }
  throw new Error(`当前环境非 Tauri 桌面端，无法调用 ${cmd}`);
}

/**
 * 标准化操作系统路径拼接
 */
export function joinNativePath(base: string, part: string): string {
  const isWindows = base.includes("\\") || /^[A-Za-z]:/.test(base);
  const sep = isWindows ? "\\" : "/";
  const cleanBase = base.replace(/[\\/]+$/, "");
  const cleanPart = part.replace(/^[\\/]+/, "").replace(/[\\/]/g, sep);
  return `${cleanBase}${sep}${cleanPart}`;
}

/**
 * 从绝对路径提取目录名
 */
export function basenameOfNativePath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

/**
 * 唤起系统原生文件夹选择对话框，返回操作系统物理绝对路径
 */
export async function pickNativeProjectDirectory(defaultPath?: string): Promise<string | null> {
  if (!isTauriApp()) return null;
  const result = await invokeTauri<string | null>("pick_project_directory", { defaultPath });
  return result;
}

/**
 * 原生写入流实现
 */
class TauriWritableFileStream implements FileSystemWritableFileStream {
  readonly locked = false;
  private buffer: Uint8Array[] = [];

  constructor(private readonly filePath: string) {}

  async write(data: FileSystemWriteChunkType): Promise<void> {
    let bytes: Uint8Array;
    if (typeof data === "string") {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data && typeof data === "object" && "data" in data) {
      return this.write((data as { data: FileSystemWriteChunkType }).data);
    } else {
      throw new Error("不支持的文件写入类型");
    }
    this.buffer.push(bytes);
  }

  async seek(): Promise<void> {
    // 暂不需要分段 seek，保存时全量覆写
  }

  async truncate(): Promise<void> {
    this.buffer = [];
  }

  async close(): Promise<void> {
    const totalLength = this.buffer.reduce((sum, b) => sum + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const b of this.buffer) {
      combined.set(b, offset);
      offset += b.length;
    }
    await invokeTauri("native_fs_write_file", {
      path: this.filePath,
      content: Array.from(combined),
    });
  }

  async abort(): Promise<void> {
    this.buffer = [];
  }

  getWriter(): WritableStreamDefaultWriter<FileSystemWriteChunkType> {
    throw new Error("getWriter 未实现");
  }

  abortStream(): Promise<void> {
    return this.abort();
  }
}

/**
 * 原生文件句柄
 */
export class TauriFileHandle implements FileSystemFileHandle {
  readonly kind = "file" as const;
  readonly name: string;
  readonly absolutePath: string;

  constructor(
    absolutePath: string,
    name?: string,
    _knownSize?: number,
    private readonly knownModifiedMs?: number,
  ) {
    this.absolutePath = absolutePath;
    this.name = name || basenameOfNativePath(absolutePath);
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    if (!other || other.kind !== "file") return false;
    if ("absolutePath" in other) {
      return this.absolutePath === (other as TauriFileHandle).absolutePath;
    }
    return this.name === other.name;
  }

  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }

  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }

  async getFile(): Promise<File> {
    const bytesArray = await invokeTauri<number[]>("native_fs_read_file", { path: this.absolutePath });
    const bytes = new Uint8Array(bytesArray);
    let mimeType = "application/octet-stream";
    if (/\.png$/i.test(this.name)) mimeType = "image/png";
    else if (/\.xml$/i.test(this.name)) mimeType = "text/xml";
    else if (/\.json$/i.test(this.name)) mimeType = "application/json";

    return new File([bytes], this.name, {
      type: mimeType,
      lastModified: this.knownModifiedMs || Date.now(),
    });
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return new TauriWritableFileStream(this.absolutePath);
  }

  async createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle> {
    throw new Error("createSyncAccessHandle 未实现");
  }
}

/**
 * 原生目录句柄实现
 */
export class TauriDirectoryHandle {
  readonly kind = "directory" as const;
  readonly name: string;
  readonly absolutePath: string;

  constructor(absolutePath: string, name?: string) {
    this.absolutePath = absolutePath;
    this.name = name || basenameOfNativePath(absolutePath);
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    if (!other || other.kind !== "directory") return false;
    if ("absolutePath" in other) {
      return this.absolutePath === (other as TauriDirectoryHandle).absolutePath;
    }
    return this.name === other.name;
  }

  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }

  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    const childPath = joinNativePath(this.absolutePath, name);
    if (options?.create) {
      await invokeTauri("native_fs_create_dir", { path: childPath });
    } else {
      const check = await invokeTauri<PathExistsResult>("native_fs_check_exists", { path: childPath });
      if (!check.exists || !check.is_dir) {
        throw new DOMException(`未找到子目录: ${name}`, "NotFoundError");
      }
    }
    return new TauriDirectoryHandle(childPath, name) as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    const childPath = joinNativePath(this.absolutePath, name);
    const check = await invokeTauri<PathExistsResult>("native_fs_check_exists", { path: childPath });
    if (!check.exists) {
      if (options?.create) {
        await invokeTauri("native_fs_write_file", { path: childPath, content: [] });
      } else {
        throw new DOMException(`未找到文件: ${name}`, "NotFoundError");
      }
    }
    return new TauriFileHandle(childPath, name) as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void> {
    const childPath = joinNativePath(this.absolutePath, name);
    await invokeTauri("native_fs_remove_entry", {
      path: childPath,
      recursive: options?.recursive ?? false,
    });
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    const entries = await invokeTauri<NativeDirEntry[]>("native_fs_read_dir", { path: this.absolutePath });
    for (const entry of entries) {
      const childPath = joinNativePath(this.absolutePath, entry.name);
      if (entry.is_dir) {
        yield [entry.name, new TauriDirectoryHandle(childPath, entry.name) as unknown as FileSystemDirectoryHandle];
      } else {
        yield [entry.name, new TauriFileHandle(childPath, entry.name, entry.size, entry.modified_ms) as unknown as FileSystemFileHandle];
      }
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for await (const [key] of this.entries()) {
      yield key;
    }
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    for await (const [, handle] of this.entries()) {
      yield handle;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
    return this.entries();
  }

  async resolve(): Promise<string[] | null> {
    return null;
  }
}

/**
 * 根据物理绝对路径创建 Tauri 目录句柄（符合 Web FileSystemDirectoryHandle 规范）
 */
export function createTauriDirectoryHandle(absolutePath: string): FileSystemDirectoryHandle {
  return new TauriDirectoryHandle(absolutePath) as unknown as FileSystemDirectoryHandle;
}
