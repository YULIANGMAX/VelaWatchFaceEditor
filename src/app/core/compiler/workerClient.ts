import { WatchfaceCompileError, type CompileInput, type CompileOptions, type CompileProgress, type CompileResult } from "./types";

interface WorkerMessage {
  id: number;
  kind: "progress" | "result" | "error";
  progress?: CompileProgress;
  result?: CompileResult;
  error?: { message: string; diagnostics: WatchfaceCompileError["diagnostics"] };
}

let requestId = 0;

export function compileWatchfaceInWorker(
  input: CompileInput,
  options: CompileOptions,
  onProgress?: (progress: CompileProgress) => void,
  signal?: AbortSignal,
): Promise<CompileResult> {
  const id = ++requestId;
  const worker = new Worker(new URL("./compiler.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("已取消构建", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new WatchfaceCompileError(event.message || "编译 Worker 运行失败", []));
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== id) return;
      if (event.data.kind === "progress" && event.data.progress) {
        onProgress?.(event.data.progress);
        return;
      }
      finish();
      if (event.data.kind === "result" && event.data.result) resolve(event.data.result);
      else reject(new WatchfaceCompileError(event.data.error?.message ?? "表盘编译失败", event.data.error?.diagnostics ?? []));
    };
    worker.postMessage({ id, input, options });
  });
}
