import { ShieldCheck, X } from "lucide-react";
import type { ParseResult } from "../../core/model";

interface BoundaryDialogProps {
  result: ParseResult | null;
  onClose: () => void;
}

export function BoundaryDialog({ result, onClose }: BoundaryDialogProps) {
  if (!result) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal boundary-dialog" role="alertdialog" aria-modal="true">
        <header className="modal-header">
          <div className="modal-header-title-wrap">
            <ShieldCheck size={20} className="boundary-header-icon" />
            <h2>项目未载入</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭提示">
            <X size={18} />
          </button>
        </header>
        <p>
          manifest.xml 结构损坏或缺少必要根节点，无法安全载入。未知扩展本身不会触发此对话框，而会无损保留并在编译前明确阻断。
        </p>
        <div className="boundary-errors">
          {result.diagnostics.map((entry) => (
            <div key={entry.id}>
              <code>{entry.location}</code>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
        <footer>
          <button className="primary-button" onClick={onClose}>
            知道了
          </button>
        </footer>
      </section>
    </div>
  );
}
