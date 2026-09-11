import { X } from "lucide-react";
import type { Diagnostic } from "../../core/model";

interface XmlEditorDialogProps {
  open: boolean;
  value: string;
  diagnostics: Diagnostic[];
  onChange: (value: string) => void;
  onApply: () => void;
  onClose: () => void;
}

export function XmlEditorDialog({
  open,
  value,
  diagnostics,
  onChange,
  onApply,
  onClose,
}: XmlEditorDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <section
        className="modal xml-editor-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>编辑 manifest.xml</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭编辑器">
            <X size={18} />
          </button>
        </header>

        <div className="xml-editor-body">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-label="manifest.xml 源码"
          />
          {diagnostics.length ? (
            <div className="xml-editor-diagnostics">
              {diagnostics.map((entry) => (
                <div key={entry.id} className={`severity-${entry.severity}`}>
                  <code>{entry.location}</code>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="xml-editor-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={onApply}>
            应用 XML
          </button>
        </footer>
      </section>
    </div>
  );
}
