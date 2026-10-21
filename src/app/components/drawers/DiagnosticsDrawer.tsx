import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { findDiagnosticTarget } from "../../core/diagnosticNavigation";
import { sortDiagnostics } from "../../core/validation";
import type { Diagnostic, WatchfaceProject } from "../../core/model";

interface DiagnosticsDrawerProps {
  open: boolean;
  diagnostics: Diagnostic[];
  project: WatchfaceProject;
  onClose: () => void;
}

const DIAGNOSTICS_DRAWER_WIDTH_KEY = "vela_diagnostics_drawer_width";
const DEFAULT_DRAWER_WIDTH = 420;
const MIN_DRAWER_WIDTH = 340;

export function DiagnosticsDrawer({
  open,
  diagnostics,
  project,
  onClose,
}: DiagnosticsDrawerProps) {
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const setSelectedTheme = useEditorStore((state) => state.setSelectedTheme);
  const [severityFilter, setSeverityFilter] = useState<Diagnostic["severity"] | null>(null);
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_DRAWER_WIDTH;
    try {
      const saved = localStorage.getItem(DIAGNOSTICS_DRAWER_WIDTH_KEY);
      const parsed = saved ? Number.parseInt(saved, 10) : Number.NaN;
      return Number.isFinite(parsed) && parsed >= MIN_DRAWER_WIDTH ? parsed : DEFAULT_DRAWER_WIDTH;
    } catch {
      return DEFAULT_DRAWER_WIDTH;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    setIsResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      const maxWidth = Math.max(MIN_DRAWER_WIDTH, window.innerWidth - 80);
      const nextWidth = Math.min(maxWidth, Math.max(MIN_DRAWER_WIDTH, startWidth + (startX - moveEvent.clientX)));
      setWidth(nextWidth);
    };
    const onUp = (upEvent: PointerEvent) => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const maxWidth = Math.max(MIN_DRAWER_WIDTH, window.innerWidth - 80);
      const finalWidth = Math.min(maxWidth, Math.max(MIN_DRAWER_WIDTH, startWidth + (startX - upEvent.clientX)));
      try {
        localStorage.setItem(DIAGNOSTICS_DRAWER_WIDTH_KEY, String(finalWidth));
      } catch {
        // ignore
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const sortedDiagnostics = useMemo(() => sortDiagnostics(diagnostics), [diagnostics]);

  if (!open) return null;

  const groups = {
    error: sortedDiagnostics.filter((entry) => entry.severity === "error"),
    warning: sortedDiagnostics.filter((entry) => entry.severity === "warning"),
    info: sortedDiagnostics.filter((entry) => entry.severity === "info"),
  };

  const visibleDiagnostics = severityFilter ? groups[severityFilter] : sortedDiagnostics;

  const navigate = (diagnostic: Diagnostic) => {
    const target = findDiagnosticTarget(project, diagnostic.location);
    if (target.kind === "project") {
      navigateTo({ kind: "project" });
    } else if (target.kind === "theme") {
      setSelectedTheme(target.themeId);
      navigateTo({ kind: "theme", themeId: target.themeId });
    } else if (target.kind === "layout") {
      setSelectedTheme(target.themeId);
      navigateTo({ kind: "layout", themeId: target.themeId, layoutId: target.layoutId });
    } else {
      navigateTo({ kind: "resource", resourceId: target.resourceId });
    }
    onClose();
  };

  return (
    <section
      className={`diagnostics-drawer${isResizing ? " is-resizing" : ""}`}
      style={{ width: `${width}px` }}
    >
      <div
        className="diagnostics-drawer-resizer"
        onPointerDown={startResize}
        title="拖动调整诊断窗口宽度"
      />
      <header className="modal-header diagnostics-drawer-header">
        <h2>项目诊断</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭诊断抽屉">
          <X size={18} />
        </button>
      </header>

      <div className="diagnostics-summary">
        {(["error", "warning", "info"] as const).map((severity) => (
          <button
            type="button"
            key={severity}
            className={`severity-${severity}${severityFilter === severity ? " is-active" : ""}`}
            onClick={() => setSeverityFilter((current) => current === severity ? null : severity)}
          >
            {groups[severity].length} {severity === "error" ? "错误" : severity === "warning" ? "警告" : "提示"}
          </button>
        ))}
      </div>

      <div className="diagnostics-list">
        {visibleDiagnostics.map((entry) => (
          <button
            type="button"
            className={`diagnostic-row severity-${entry.severity}`}
            key={entry.id}
            onClick={() => navigate(entry)}
            title="跳转到诊断位置"
          >
            {entry.severity === "error" ? (
              <AlertTriangle size={16} />
            ) : entry.severity === "warning" ? (
              <AlertTriangle size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <div>
              <strong>{entry.message}</strong>
              <small>{entry.location} · {entry.code}</small>
            </div>
          </button>
        ))}
        {diagnostics.length === 0 ? (
          <div className="diagnostics-clean">
            <ShieldCheck size={28} />
            <strong>项目通过严格校验</strong>
            <span>保存项目后即可使用内置 TypeScript 编译器构建。</span>
          </div>
        ) : null}
        {diagnostics.length > 0 && visibleDiagnostics.length === 0 ? (
          <div className="diagnostics-empty">当前筛选条件下没有诊断。</div>
        ) : null}
      </div>
    </section>
  );
}
