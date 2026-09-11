import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info, X } from "lucide-react";
import { dialogManager } from "../core/dialog";

export function ModalDialogHost() {
  const [dialog, setDialog] = useState(dialogManager.getState());
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return dialogManager.subscribe((next) => {
      setDialog(next);
      if (next?.type === "prompt") {
        setInputValue(next.options.defaultValue ?? "");
        setValidationError(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    if (dialog.type === "prompt") {
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      window.setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
  }, [dialog]);

  if (!dialog) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (dialog.type === "confirm") dialog.resolve(false);
      else if (dialog.type === "prompt") dialog.resolve(null);
      else dialog.resolve();
    }
  };

  const submitPrompt = () => {
    if (dialog.type !== "prompt") return;
    if (dialog.options.validate) {
      const error = dialog.options.validate(inputValue);
      if (error) {
        setValidationError(error);
        return;
      }
    }
    dialog.resolve(inputValue);
  };

  return (
    <div className="modal-backdrop app-dialog-backdrop" role="dialog" aria-modal="true" onKeyDown={handleKeyDown}>
      <div className={`app-dialog-card modal ${dialog.type === "confirm" && dialog.options.danger ? "is-danger" : ""}`}>
        <div className="app-dialog-header">
          <div className="app-dialog-title-group">
            {dialog.type === "confirm" ? (
              dialog.options.danger ? (
                <div className="app-dialog-icon danger"><AlertTriangle size={18} /></div>
              ) : (
                <div className="app-dialog-icon confirm"><HelpCircle size={18} /></div>
              )
            ) : dialog.type === "prompt" ? (
              <div className="app-dialog-icon prompt"><Info size={18} /></div>
            ) : (
              <div className={`app-dialog-icon alert ${dialog.options.type || "info"}`}>
                {dialog.options.type === "error" ? (
                  <AlertCircle size={18} />
                ) : dialog.options.type === "warning" ? (
                  <AlertTriangle size={18} />
                ) : dialog.options.type === "success" ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <Info size={18} />
                )}
              </div>
            )}
            <h3>{dialog.options.title || (dialog.type === "confirm" ? "确认操作" : dialog.type === "prompt" ? "输入信息" : "提示")}</h3>
          </div>
          <button
            className="app-dialog-close-btn"
            onClick={() => {
              if (dialog.type === "confirm") dialog.resolve(false);
              else if (dialog.type === "prompt") dialog.resolve(null);
              else dialog.resolve();
            }}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="app-dialog-body">
          {dialog.options.message ? <p className="app-dialog-message">{dialog.options.message}</p> : null}

          {dialog.type === "prompt" ? (
            <div className="app-dialog-prompt-field">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                placeholder={dialog.options.placeholder || ""}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitPrompt();
                  }
                }}
              />
              {validationError ? <small className="app-dialog-field-error">{validationError}</small> : null}
            </div>
          ) : null}
        </div>

        <div className="app-dialog-footer">
          {dialog.type === "confirm" ? (
            <>
              <button className="secondary-button" onClick={() => dialog.resolve(false)}>
                {dialog.options.cancelText || "取消"}
              </button>
              <button
                ref={confirmBtnRef}
                className={dialog.options.danger ? "danger-button" : "primary-button"}
                onClick={() => dialog.resolve(true)}
              >
                {dialog.options.confirmText || "确定"}
              </button>
            </>
          ) : dialog.type === "prompt" ? (
            <>
              <button className="secondary-button" onClick={() => dialog.resolve(null)}>
                {dialog.options.cancelText || "取消"}
              </button>
              <button className="primary-button" onClick={submitPrompt}>
                {dialog.options.confirmText || "确定"}
              </button>
            </>
          ) : (
            <button ref={confirmBtnRef} className="primary-button" onClick={() => dialog.resolve()}>
              {dialog.options.confirmText || "我知道了"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
