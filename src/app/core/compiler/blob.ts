const RETRY_DELAYS_MS = [80, 160, 320] as const;

function isTemporarilyUnreadable(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotReadableError";
}

/**
 * 读取资源文件的内存快照。
 * Windows 在刚关闭写入流时，偶发短暂拒绝读取 File System Access API 的 File 引用。
 */
export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return new Uint8Array(await blob.arrayBuffer());
    } catch (error) {
      if (!isTemporarilyUnreadable(error) || attempt === RETRY_DELAYS_MS.length) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw new Error("资源文件读取重试异常结束");
}
