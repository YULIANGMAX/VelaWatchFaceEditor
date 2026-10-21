import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  FileCode,
  FileText,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";
import { dialogManager } from "../../core/dialog";

export interface CodeEditorDialogProps {
  open: boolean;
  assetPath: string;
  initialContent: string;
  onSave: (newContent: string) => Promise<boolean | void> | boolean | void;
  onClose: () => void;
}

interface HistoryStep {
  text: string;
  cursor: number;
}

export const CodeEditorDialog = memo(function CodeEditorDialog({
  open,
  assetPath,
  initialContent,
  onSave,
  onClose,
}: CodeEditorDialogProps) {
  const [content, setContent] = useState(initialContent);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  // 完备的历史撤销/重做栈（支持百步级撤销）
  const historyRef = useRef<HistoryStep[]>([{ text: initialContent, cursor: 0 }]);
  const historyIndexRef = useRef<number>(0);
  const lastTypeTimeRef = useRef<number>(0);
  const isNewGroupRef = useRef<boolean>(true);

  // 打开时重置所有状态与历史
  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setLastSavedContent(initialContent);
      historyRef.current = [{ text: initialContent, cursor: 0 }];
      historyIndexRef.current = 0;
      lastTypeTimeRef.current = 0;
      isNewGroupRef.current = true;
      setCanUndo(false);
      setCanRedo(false);
      setSaveFeedback(null);
      setCopied(false);
      setShowCloseConfirm(false);
      setCursorPos({ line: 1, col: 1 });
    }
  }, [open, initialContent]);

  const isDirty = content !== lastSavedContent;
  const isLua = assetPath.toLowerCase().endsWith(".lua");
  const filename = assetPath.split("/").at(-1) ?? assetPath;
  const lines = content.split("\n");

  // 直接提交独立历史步（用于 Tab 缩进、还原、清空等操作）
  const pushDirectStep = useCallback((val: string, newCursor: number) => {
    let history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push({ text: val, cursor: newCursor });
    if (history.length > 200) {
      history.shift();
    }
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setContent(val);
    isNewGroupRef.current = true;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = newCursor;
        textarea.focus();
      }
    });
  }, []);

  // 文本输入变动：按词/标点/停顿精细划分为连续多步历史
  const handleContentChange = (newVal: string) => {
    const textarea = textareaRef.current;
    const cursor = textarea ? textarea.selectionStart : newVal.length;
    const prev = content;
    setContent(newVal);

    const now = Date.now();
    const timeDiff = now - lastTypeTimeRef.current;
    lastTypeTimeRef.current = now;

    const charBeforeCursor = newVal.slice(Math.max(0, cursor - 1), cursor);
    const isDelimiter = /[\s\n\t,;(){}[\]=+\-*/<>:"]/.test(charBeforeCursor);
    const isBigJump = Math.abs(newVal.length - prev.length) > 1;
    const shouldStartNewGroup = isNewGroupRef.current || isBigJump || isDelimiter || timeDiff > 600;

    let history = historyRef.current.slice(0, historyIndexRef.current + 1);

    if (shouldStartNewGroup) {
      history.push({ text: newVal, cursor });
      if (history.length > 200) {
        history.shift();
      }
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
      isNewGroupRef.current = isDelimiter;
    } else {
      history[historyIndexRef.current] = { text: newVal, cursor };
      historyRef.current = history;
      isNewGroupRef.current = false;
    }

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  // 撤销（支持多步向前追溯）
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const step = historyRef.current[historyIndexRef.current];
    setContent(step.text);
    isNewGroupRef.current = true;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = step.cursor;
        textarea.focus();
      }
    });
  }, []);

  // 重做（支持多步向后恢复）
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const step = historyRef.current[historyIndexRef.current];
    setContent(step.text);
    isNewGroupRef.current = true;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = step.cursor;
        textarea.focus();
      }
    });
  }, []);

  // 保存操作
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    setSaveFeedback("正在保存...");
    try {
      await onSave(content);
      setLastSavedContent(content);
      setSaveFeedback("✓ 已保存");
      setTimeout(() => setSaveFeedback(null), 2500);
      return true;
    } catch (error) {
      setSaveFeedback(null);
      void dialogManager.alert({
        title: "保存文件失败",
        message: error instanceof Error ? error.message : "无法写入文件",
        type: "error",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [content, isSaving, onSave]);

  // 还原修改
  const handleReset = useCallback(() => {
    if (!isDirty) return;
    pushDirectStep(lastSavedContent, 0);
  }, [isDirty, lastSavedContent, pushDirectStep]);

  // 复制代码
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [content]);

  // 更新光标行列位置
  const updateCursorPos = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const textBefore = textarea.value.substring(0, textarea.selectionStart);
    const splitLines = textBefore.split("\n");
    setCursorPos({
      line: splitLines.length,
      col: splitLines[splitLines.length - 1].length + 1,
    });
  }, []);

  // 滚动行号同步
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  // 请求关闭弹窗（有未保存修改时拦截提示）
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // 快捷键监听
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+S / Cmd+S: 保存
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void handleSave();
        return;
      }

      // Ctrl+Z / Cmd+Z: 撤销 / 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      // Ctrl+Y / Cmd+Y: 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Tab 键: 缩进 2 空格
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const nextVal = val.substring(0, start) + "  " + val.substring(end);
        pushDirectStep(nextVal, start + 2);
      }
    },
    [handleRedo, handleSave, handleUndo, pushDirectStep],
  );

  // Esc 快捷键关闭处理
  useEffect(() => {
    if (!open) return;
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showCloseConfirm) {
          setShowCloseConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [open, showCloseConfirm, handleRequestClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onPointerDown={handleRequestClose}>
      <section
        className="modal code-editor-dialog"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`编辑 ${filename}`}
      >
        {/* 1. 对话框头部 */}
        <header className="modal-header code-editor-header">
          <div className="code-editor-header-title">
            {isLua ? (
              <FileCode size={18} className="code-editor-file-icon is-lua" />
            ) : (
              <FileText size={18} className="code-editor-file-icon" />
            )}
            <h2>编辑 {filename}</h2>
            <span className="code-editor-path-pill" title={`resources/${assetPath}`}>
              resources/{assetPath}
            </span>
            {isDirty ? <span className="code-editor-dirty-badge">● 未保存</span> : null}
          </div>
          <button
            className="icon-button"
            onClick={handleRequestClose}
            aria-label="关闭编辑器"
            title="关闭窗口 (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        {/* 2. 集中顶部操作工具栏：保存、多步撤销、多步重做、还原、复制代码 */}
        <div className="code-editor-toolbar">
          <div className="code-editor-tool-group">
            <button
              type="button"
              className={`code-editor-tool-btn is-save${isDirty ? " is-dirty" : ""}`}
              onClick={() => void handleSave()}
              disabled={!isDirty || isSaving}
              title="保存修改到项目与磁盘 (Ctrl+S)"
            >
              <Save size={14} />
              <span>保存</span>
            </button>
            <button
              type="button"
              className="code-editor-tool-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={14} />
              <span>撤销</span>
            </button>
            <button
              type="button"
              className="code-editor-tool-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
            >
              <Redo2 size={14} />
              <span>重做</span>
            </button>
          </div>

          <div className="code-editor-tool-sep" />

          <div className="code-editor-tool-group">
            <button
              type="button"
              className="code-editor-tool-btn is-reset"
              onClick={handleReset}
              disabled={!isDirty}
              title="丢弃当前所有修改，恢复为上次保存内容"
            >
              <RotateCcw size={14} />
              <span>还原</span>
            </button>
            <button
              type="button"
              className="code-editor-tool-btn"
              onClick={() => void handleCopy()}
              title="复制全部代码内容"
            >
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              <span>{copied ? "已复制" : "复制代码"}</span>
            </button>
          </div>

          <div className="code-editor-toolbar-hint">
            <span>Tab: 缩进 2 空格 · Ctrl+S: 保存 · Ctrl+Z: 撤销 · Ctrl+Y: 重做</span>
          </div>
        </div>

        {/* 3. 编辑区：无截断完整行号栏与等宽输入区 */}
        <div className="code-editor-workspace">
          <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
            {lines.map((_, idx) => (
              <span key={idx} className="code-editor-line-num">
                {idx + 1}
              </span>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="code-editor-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onSelect={updateCursorPos}
            onClick={updateCursorPos}
            onKeyUp={updateCursorPos}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="脚本内容为空"
            aria-label="代码编辑区"
          />
        </div>

        {/* 4. 底部状态栏（不包含按钮，仅展示光标行列与保存状态） */}
        <div className="code-editor-statusbar">
          <div className="code-editor-status-left">
            <span>行 {cursorPos.line}, 列 {cursorPos.col}</span>
            <span className="code-editor-status-dot">·</span>
            <span>共 {lines.length} 行</span>
            <span className="code-editor-status-dot">·</span>
            <span>{content.length} 字符</span>
            <span className="code-editor-status-dot">·</span>
            <span>UTF-8</span>
          </div>
          <div className="code-editor-status-right">
            {saveFeedback ? (
              <span className="code-editor-status-feedback">{saveFeedback}</span>
            ) : isDirty ? (
              <span className="code-editor-status-dirty">● 未保存修改 (Ctrl+S 保存)</span>
            ) : (
              <span className="code-editor-status-clean">已同步到磁盘</span>
            )}
          </div>
        </div>

        {/* 5. 未保存退出三选提示弹窗（保存 / 放弃 / 取消） */}
        {showCloseConfirm ? (
          <div
            className="code-editor-confirm-backdrop"
            onPointerDown={(e) => {
              e.stopPropagation();
              setShowCloseConfirm(false);
            }}
          >
            <div
              className="code-editor-confirm-modal"
              onPointerDown={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-label="未保存的代码修改提示"
            >
              <div className="code-editor-confirm-header">
                <div className="code-editor-confirm-icon">
                  <AlertTriangle size={20} color="#d97706" />
                </div>
                <div className="code-editor-confirm-title-group">
                  <h3>未保存的代码修改</h3>
                  <p>
                    文件 <code>resources/{assetPath}</code> 存在尚未保存的修改。<br />
                    关闭窗口前是否需要保存这些修改？
                  </p>
                </div>
              </div>
              <div className="code-editor-confirm-actions">
                <button
                  type="button"
                  className="code-editor-confirm-btn is-cancel"
                  onClick={() => setShowCloseConfirm(false)}
                  title="不保存也不关闭，回到编辑窗口"
                >
                  取消
                </button>
                <button
                  type="button"
                  className="code-editor-confirm-btn is-discard"
                  onClick={() => {
                    setShowCloseConfirm(false);
                    onClose();
                  }}
                  title="不保存且直接关闭窗口"
                >
                  放弃
                </button>
                <button
                  type="button"
                  className="code-editor-confirm-btn is-save"
                  onClick={async () => {
                    const ok = await handleSave();
                    if (ok) {
                      setShowCloseConfirm(false);
                      onClose();
                    }
                  }}
                  disabled={isSaving}
                  title="保存修改之后关闭窗口"
                >
                  {isSaving ? "正在保存..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
});
