import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import {
  createCompileInput,
  WatchfaceCompileError,
  type CompileProgress,
  type CompileResult,
} from "../../core/compiler";
import { compileWatchfaceInWorker } from "../../core/compiler/workerClient";
import { writeResourceBin } from "../../core/compiler/storage";
import { createId, getDeviceDefinition, type Diagnostic } from "../../core/model";

const BUILD_STAGE_LABELS: Record<CompileProgress["stage"], string> = {
  prepare: "准备资源图",
  "decode-images": "解析 PNG",
  "encode-resources": "编码资源",
  assemble: "组装 resource.bin",
};

interface BuildBinDialogProps {
  open: boolean;
  directory: FileSystemDirectoryHandle | null;
  diagnostics: Diagnostic[];
  clean: boolean;
  saving: boolean;
  onClose: () => void;
}

export function BuildBinDialog({
  open,
  directory,
  diagnostics,
  clean,
  saving,
  onClose,
}: BuildBinDialogProps) {
  const project = useEditorStore((state) => state.project);
  const contentRevision = useEditorStore((state) => state.contentRevision);
  const [phase, setPhase] = useState<"idle" | "compiling" | "writing" | "success" | "error">("idle");
  const [progress, setProgress] = useState<CompileProgress>({ stage: "prepare", completed: 0, total: 1 });
  const [result, setResult] = useState<CompileResult | null>(null);
  const [buildDiagnostics, setBuildDiagnostics] = useState<Diagnostic[]>([]);
  const controller = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);
  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const working = phase === "compiling" || phase === "writing";

  useEffect(() => {
    if (!open) {
      controller.current?.abort();
      controller.current = null;
      setPhase("idle");
      setResult(null);
      setBuildDiagnostics([]);
      autoStarted.current = false;
    }
  }, [open]);

  const startBuild = async () => {
    if (working || errorCount > 0 || !clean || saving) return;
    const startRevision = contentRevision;
    const abortController = new AbortController();
    controller.current = abortController;
    setPhase("compiling");
    setResult(null);
    setBuildDiagnostics([]);
    try {
      const compiled = await compileWatchfaceInWorker(
        createCompileInput(project),
        { device: getDeviceDefinition(project.device) },
        setProgress,
        abortController.signal,
      );
      if (useEditorStore.getState().contentRevision !== startRevision) {
        throw new WatchfaceCompileError("编译期间项目已更改，请保存后重新编译", [
          {
            id: createId("compile"),
            severity: "error",
            code: "project-changed-during-build",
            message: "编译期间项目已更改，请保存后重新编译",
            location: "编译",
          },
        ]);
      }
      setPhase("writing");
      if (directory) {
        await writeResourceBin(directory, compiled.bytes, abortController.signal);
      } else {
        const blob = new Blob([compiled.bytes as unknown as BlobPart], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resource.bin";
        a.click();
        URL.revokeObjectURL(url);
      }
      setResult(compiled);
      setPhase("success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase("idle");
        return;
      }
      setBuildDiagnostics(
        error instanceof WatchfaceCompileError && error.diagnostics.length
          ? error.diagnostics
          : [
              {
                id: createId("compile"),
                severity: "error",
                code: "build-or-write-failed",
                message: error instanceof Error ? error.message : "构建或写入失败",
                location: "resource.bin",
              },
            ],
      );
      setPhase("error");
    } finally {
      controller.current = null;
    }
  };

  useEffect(() => {
    if (!open || autoStarted.current) return;
    autoStarted.current = true;
    void startBuild();
  }, [open]);

  if (!open) return null;

  const reason = errorCount > 0
    ? `项目仍有 ${errorCount} 个校验错误`
    : !clean
      ? "项目尚未保存，请先保存项目"
      : saving
        ? "项目正在保存"
        : "";

  const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="modal-backdrop">
      <section
        className="modal command-dialog build-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {working ? (
          <div className="build-progress" aria-live="polite">
            <strong>{phase === "writing" ? "写入 resource.bin" : BUILD_STAGE_LABELS[progress.stage]}</strong>
            <progress max={100} value={phase === "writing" ? 100 : percentage} />
            <span>
              {phase === "writing"
                ? "编译已完成，正在事务性写入"
                : `${progress.completed}/${progress.total}（${percentage}%）`}
            </span>
          </div>
        ) : null}

        {phase === "success" && result ? (
          <div className="build-result">
            <CheckCircle2 size={20} />
            <strong>编译成功</strong>
            <span>
              {result.size.toLocaleString()} 字节 · {result.faceCount} 个主题 · {result.resourceCount} 个资源
            </span>
            <code>SHA-256 {result.sha256}</code>
          </div>
        ) : null}

        {buildDiagnostics.length ? (
          <div className="boundary-errors">
            {buildDiagnostics.map((entry) => (
              <div key={entry.id}>
                <code>{entry.location}</code>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        ) : null}

        {reason ? (
          <div className="command-warning">
            <AlertTriangle size={16} />
            <span>{reason}</span>
          </div>
        ) : null}

        <footer className="xml-editor-actions">
          <button className="primary-button" disabled={working} onClick={onClose}>
            确定
          </button>
        </footer>
      </section>
    </div>
  );
}
