import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  FileCode,
  FileCode2,
  FileText,
  Info,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";
import type { Diagnostic } from "../../core/model";
import { dialogManager } from "../../core/dialog";
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
  type CodeLanguage,
  type CodeEditorStats,
} from "../editor/CodeMirrorEditor";

export interface CodeEditorDialogProps {
  open: boolean;
  assetPath: string;
  initialContent: string;
  diagnostics?: Diagnostic[];
  onSave: (newContent: string) => Promise<boolean | void> | boolean | void;
  onClose: () => void;
}

export const CodeEditorDialog = memo(function CodeEditorDialog({
  open,
  assetPath,
  initialContent,
  diagnostics,
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
  const [stats, setStats] = useState<CodeEditorStats>({
    line: 1,
    col: 1,
    totalLines: initialContent.split("\n").length,
    charCount: initialContent.length,
  });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);

  // 打开时重置所有状态
  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setLastSavedContent(initialContent);
      setCanUndo(false);
      setCanRedo(false);
      setSaveFeedback(null);
      setCopied(false);
      setShowCloseConfirm(false);
      setStats({
        line: 1,
        col: 1,
        totalLines: initialContent.split("\n").length,
        charCount: initialContent.length,
      });
    }
  }, [open, initialContent]);

  const isDirty = content !== lastSavedContent;
  const isLua = assetPath.toLowerCase().endsWith(".lua");
  const isXml = assetPath.toLowerCase().endsWith(".xml");
  const language: CodeLanguage = isLua ? "lua" : isXml ? "xml" : "text";
  const filename = assetPath.split("/").at(-1) ?? assetPath;
  const isRootFile = assetPath === "manifest.xml" || !assetPath.includes("/");
  const displayPath = isRootFile ? assetPath : `resources/${assetPath}`;

  // 撤销
  const handleUndo = useCallback(() => {
    editorRef.current?.undo();
  }, []);

  // 重做
  const handleRedo = useCallback(() => {
    editorRef.current?.redo();
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
        title: "保存失败",
        message: error instanceof Error ? error.message : "无法保存内容，请检查语法",
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
    setContent(lastSavedContent);
    editorRef.current?.focus();
  }, [isDirty, lastSavedContent]);

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

  // 请求关闭弹窗（有未保存修改时拦截提示）
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // 全局快捷键监听（Esc 拦截）
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
            ) : isXml ? (
              <FileCode2 size={18} className="code-editor-file-icon" style={{ color: "#38bdf8" }} />
            ) : (
              <FileText size={18} className="code-editor-file-icon" />
            )}
            <h2>编辑 {filename}</h2>
            <span className="code-editor-path-pill" title={displayPath}>
              {displayPath}
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

        {/* 2. 集中顶部操作工具栏：保存、撤销、重做、还原、复制代码 */}
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
            <span>Tab: 缩进 · Ctrl+S: 保存 · Ctrl+Z: 撤销 · Ctrl+Y: 重做 · Ctrl+F: 查找</span>
          </div>
        </div>

        {/* 3. CodeMirror 6 编辑区 */}
        <div className="code-editor-workspace">
          <CodeMirrorEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            language={language}
            onCursorChange={setStats}
            onHistoryChange={({ canUndo: u, canRedo: r }) => {
              setCanUndo(u);
              setCanRedo(r);
            }}
            onSaveShortcut={() => void handleSave()}
            autoFocus
          />

          {/* 校验错误诊断面板（如果存在） */}
          {diagnostics && diagnostics.length > 0 ? (
            <div className="code-editor-diagnostics">
              <div className="code-editor-diagnostics-header">
                <AlertCircle size={14} color="#ef4444" />
                <span>XML 校验未通过（共 {diagnostics.length} 处诊断问题）</span>
              </div>
              <div className="code-editor-diagnostics-list">
                {diagnostics.map((entry) => (
                  <div key={entry.id} className={`code-diag-item severity-${entry.severity}`}>
                    <div className="code-diag-icon">
                      {entry.severity === "error" ? (
                        <AlertCircle size={14} color="#ef4444" />
                      ) : entry.severity === "warning" ? (
                        <AlertTriangle size={14} color="#f59e0b" />
                      ) : (
                        <Info size={14} color="#3b82f6" />
                      )}
                    </div>
                    <code className="code-diag-loc" title={entry.location}>
                      {entry.location}
                    </code>
                    <span className="code-diag-msg">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 4. 底部状态栏 */}
        <div className="code-editor-statusbar">
          <div className="code-editor-status-left">
            <span>行 {stats.line}, 列 {stats.col}</span>
            <span className="code-editor-status-dot">·</span>
            <span>共 {stats.totalLines} 行</span>
            <span className="code-editor-status-dot">·</span>
            <span>{stats.charCount} 字符</span>
            <span className="code-editor-status-dot">·</span>
            <span style={{ fontWeight: 600, color: isLua ? "#10b981" : isXml ? "#38bdf8" : "#94a3b8" }}>
              {language.toUpperCase()}
            </span>
            <span className="code-editor-status-dot">·</span>
            <span>UTF-8</span>
          </div>
          <div className="code-editor-status-right">
            {saveFeedback ? (
              <span className="code-editor-status-feedback">{saveFeedback}</span>
            ) : diagnostics && diagnostics.length > 0 ? (
              <span className="code-editor-status-dirty" style={{ color: "#ef4444" }}>
                ⚠️ 存在 {diagnostics.length} 处解析/校验问题
              </span>
            ) : isDirty ? (
              <span className="code-editor-status-dirty">● 未保存修改 (Ctrl+S 保存)</span>
            ) : (
              <span className="code-editor-status-clean">已同步到项目</span>
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
                    文件 <code>{displayPath}</code> 存在尚未保存的修改。<br />
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
