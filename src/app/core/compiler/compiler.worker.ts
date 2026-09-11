/// <reference lib="webworker" />

import { compileWatchface } from "./index";
import { WatchfaceCompileError, type CompileInput, type CompileOptions } from "./types";

interface CompileRequest {
  id: number;
  input: CompileInput;
  options: CompileOptions;
}

self.onmessage = async (event: MessageEvent<CompileRequest>) => {
  const { id, input, options } = event.data;
  try {
    const result = await compileWatchface(input, options, (progress) => {
      self.postMessage({ id, kind: "progress", progress });
    });
    const bytes = result.bytes.slice();
    self.postMessage({ id, kind: "result", result: { ...result, bytes } }, [bytes.buffer]);
  } catch (error) {
    const compileError = error instanceof WatchfaceCompileError ? error : null;
    self.postMessage({
      id,
      kind: "error",
      error: {
        message: error instanceof Error ? error.message : "表盘编译失败",
        diagnostics: compileError?.diagnostics ?? [],
      },
    });
  }
};

export {};
