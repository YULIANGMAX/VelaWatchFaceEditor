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

export function DiagnosticsDrawer({
  open,
  diagnostics,
  project,
  onClose,
}: DiagnosticsDrawerProps) {
  const setSelection = useEditorStore((state) => state.setSelection);
  const setSelectedTheme = useEditorStore((state) => state.setSelectedTheme);
  const [severityFilter, setSeverityFilter] = useState<Diagnostic["severity"] | null>(null);

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
      setSelection({ kind: "project" });
    } else if (target.kind === "theme") {
      setSelectedTheme(target.themeId);
    } else if (target.kind === "layout") {
      setSelectedTheme(target.themeId);
      setSelection({ kind: "layout", themeId: target.themeId, layoutId: target.layoutId });
    } else {
      setSelection({ kind: "resource", resourceId: target.resourceId });
    }
    onClose();
  };

  return (
    <section className="diagnostics-drawer">
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
