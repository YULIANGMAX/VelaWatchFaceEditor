import { describe, expect, it } from "vitest";
import { resourceBinExists, writeResourceBin } from "./storage";

class MemoryDirectory {
  bytes?: Uint8Array;
  failWrite = false;
  pauseWrite = false;
  aborted = false;
  writeStarted?: () => void;
  private rejectPendingWrite?: (reason: unknown) => void;

  async getFileHandle(_name: string, options?: { create?: boolean }) {
    if (!this.bytes && !options?.create) throw new DOMException("不存在", "NotFoundError");
    return {
      createWritable: async () => {
        let staged: Uint8Array | undefined;
        return {
          write: async (blob: Blob) => {
            if (this.failWrite) throw new Error("模拟写入失败");
            if (this.pauseWrite) {
              this.writeStarted?.();
              await new Promise<never>((_resolve, reject) => { this.rejectPendingWrite = reject; });
            }
            staged = new Uint8Array(await blob.arrayBuffer());
          },
          close: async () => { this.bytes = staged; },
          abort: async () => {
            this.aborted = true;
            this.rejectPendingWrite?.(new DOMException("已取消", "AbortError"));
          },
        };
      },
    };
  }
}

function handle(directory: MemoryDirectory): FileSystemDirectoryHandle {
  return directory as unknown as FileSystemDirectoryHandle;
}

describe("resource.bin 安全写盘", () => {
  it("检测文件存在并在 close 时替换完整内容", async () => {
    const directory = new MemoryDirectory();
    expect(await resourceBinExists(handle(directory))).toBe(false);
    directory.bytes = Uint8Array.of(1, 2, 3);
    expect(await resourceBinExists(handle(directory))).toBe(true);
    await writeResourceBin(handle(directory), Uint8Array.of(4, 5));
    expect(directory.bytes).toEqual(Uint8Array.of(4, 5));
  });

  it("写入失败时 abort 且旧内容不变", async () => {
    const directory = new MemoryDirectory();
    directory.bytes = Uint8Array.of(1, 2, 3);
    directory.failWrite = true;
    await expect(writeResourceBin(handle(directory), Uint8Array.of(9))).rejects.toThrow("模拟写入失败");
    expect(directory.aborted).toBe(true);
    expect(directory.bytes).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("写入期间取消时 abort 且旧内容不变", async () => {
    const directory = new MemoryDirectory();
    directory.bytes = Uint8Array.of(1, 2, 3);
    directory.pauseWrite = true;
    const started = new Promise<void>((resolve) => { directory.writeStarted = resolve; });
    const controller = new AbortController();
    const writing = writeResourceBin(handle(directory), Uint8Array.of(9), controller.signal);
    await started;
    controller.abort();
    await expect(writing).rejects.toMatchObject({ name: "AbortError" });
    expect(directory.aborted).toBe(true);
    expect(directory.bytes).toEqual(Uint8Array.of(1, 2, 3));
  });
});
