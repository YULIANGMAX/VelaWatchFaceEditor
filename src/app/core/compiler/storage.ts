export async function resourceBinExists(directory: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await directory.getFileHandle("resource.bin");
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return false;
    throw error;
  }
}

export async function writeResourceBin(
  directory: FileSystemDirectoryHandle,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new DOMException("已取消写入", "AbortError");
  const handle = await directory.getFileHandle("resource.bin", { create: true });
  const writable = await handle.createWritable();
  let rejectAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => {
    void writable.abort().finally(() => rejectAbort?.(new DOMException("已取消写入", "AbortError")));
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) abort();
    await Promise.race([
      writable.write(new Blob([bytes.slice()], { type: "application/octet-stream" })),
      aborted,
    ]);
    await Promise.race([writable.close(), aborted]);
  } catch (error) {
    if (!signal?.aborted) await writable.abort().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
