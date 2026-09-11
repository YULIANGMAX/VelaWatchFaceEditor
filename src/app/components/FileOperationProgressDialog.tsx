import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import type { ResourceFileProgress } from "../core/projectIO";

export interface FileOperationState {
  kind: "import" | "move";
  progress: ResourceFileProgress;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function FileOperationProgressDialog({ operation }: { operation: FileOperationState | null }) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (operation) dialogRef.current?.focus();
  }, [Boolean(operation)]);

  if (!operation) return null;
  const { progress } = operation;
  const ratio = progress.totalBytes > 0
    ? progress.writtenBytes / progress.totalBytes
    : progress.totalFiles > 0 ? progress.completedFiles / progress.totalFiles : 1;
  const percentage = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const title = operation.kind === "import" ? "正在复制到项目目录" : "正在移动资源文件";

  return (
    <div
      className="modal-backdrop file-operation-progress-backdrop"
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <section
        ref={dialogRef}
        className="modal file-operation-progress-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="file-operation-progress-title"
        aria-describedby="file-operation-progress-note"
        tabIndex={-1}
        onKeyDown={(event) => event.preventDefault()}
      >
        <LoaderCircle className="file-operation-progress-spinner" size={34} />
        <h2 id="file-operation-progress-title">{title}</h2>
        <code title={`resources/${progress.currentPath}`}>resources/{progress.currentPath}</code>
        <div
          className="file-operation-progress-track"
          role="progressbar"
          aria-label="文件操作进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <span style={{ width: `${percentage}%` }} />
        </div>
        <div className="file-operation-progress-status" aria-live="polite">
          <strong>{percentage}%</strong>
          <span>{progress.completedFiles}/{progress.totalFiles} 个文件</span>
          <span>{formatBytes(progress.writtenBytes)} / {formatBytes(progress.totalBytes)}</span>
        </div>
        <p id="file-operation-progress-note">操作完成前不能进行其他操作，请勿关闭页面。</p>
      </section>
    </div>
  );
}
