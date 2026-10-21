import { forwardRef, useImperativeHandle, useRef, useMemo, useEffect, useCallback } from "react";
import CodeMirror, {
  ReactCodeMirrorRef,
  EditorView,
  Extension,
  ViewUpdate,
} from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { StreamLanguage } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { oneDark } from "@codemirror/theme-one-dark";
import { undo, redo, undoDepth, redoDepth, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";

export type CodeLanguage = "lua" | "xml" | "text";

export interface CodeEditorStats {
  line: number;
  col: number;
  totalLines: number;
  charCount: number;
}

export interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
  onCursorChange?: (stats: CodeEditorStats) => void;
  onHistoryChange?: (status: { canUndo: boolean; canRedo: boolean }) => void;
  onSaveShortcut?: () => void;
}

export interface CodeMirrorEditorHandle {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  focus: () => void;
  getView: () => EditorView | undefined;
}

const customDarkTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    fontSize: "13px",
    fontFamily: "Consolas, 'Fira Code', Monaco, 'Courier New', monospace",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.6",
    overflow: "auto !important",
    height: "100% !important",
  },
  ".cm-gutters": {
    backgroundColor: "#090d16",
    color: "#475569",
    borderRight: "1px solid #1e293b",
    userSelect: "none",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#161e2e",
    color: "#94a3b8",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#38bdf8",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(56, 189, 248, 0.25) !important",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    outline: "1px solid #38bdf8",
    color: "#ffffff !important",
  },
});

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    {
      value,
      onChange,
      language = "text",
      placeholder = "代码内容为空",
      readOnly = false,
      autoFocus = false,
      className = "",
      onCursorChange,
      onHistoryChange,
      onSaveShortcut,
    },
    ref,
  ) {
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const onSaveShortcutRef = useRef(onSaveShortcut);
    const onCursorChangeRef = useRef(onCursorChange);
    const onHistoryChangeRef = useRef(onHistoryChange);

    useEffect(() => {
      onSaveShortcutRef.current = onSaveShortcut;
      onCursorChangeRef.current = onCursorChange;
      onHistoryChangeRef.current = onHistoryChange;
    });

    // 语言语法扩展
    const languageExtension = useMemo<Extension | null>(() => {
      switch (language) {
        case "lua":
          return StreamLanguage.define(lua);
        case "xml":
          return xml();
        default:
          return null;
      }
    }, [language]);

    // 快捷键映射扩展（Tab 缩进与 Mod-s 拦截）
    const keymapExtension = useMemo<Extension>(() => {
      return keymap.of([
        indentWithTab,
        {
          key: "Mod-s",
          run: () => {
            if (onSaveShortcutRef.current) {
              onSaveShortcutRef.current();
              return true;
            }
            return false;
          },
        },
      ]);
    }, []);

    // 组合所有扩展
    const extensions = useMemo<Extension[]>(() => {
      const list: Extension[] = [
        customDarkTheme,
        oneDark,
        keymapExtension,
        EditorView.lineWrapping,
      ];
      if (languageExtension) {
        list.push(languageExtension);
      }
      return list;
    }, [keymapExtension, languageExtension]);

    // 视口更新回调：光标行列与撤销/重做状态感知
    const handleUpdate = useCallback((viewUpdate: ViewUpdate) => {
      const view = viewUpdate.view;
      if (viewUpdate.selectionSet || viewUpdate.docChanged) {
        const head = view.state.selection.main.head;
        const lineObj = view.state.doc.lineAt(head);
        const col = head - lineObj.from + 1;
        onCursorChangeRef.current?.({
          line: lineObj.number,
          col,
          totalLines: view.state.doc.lines,
          charCount: view.state.doc.length,
        });
      }

      if (viewUpdate.docChanged || viewUpdate.selectionSet) {
        const canUndo = undoDepth(view.state) > 0;
        const canRedo = redoDepth(view.state) > 0;
        onHistoryChangeRef.current?.({ canUndo, canRedo });
      }
    }, []);

    // 暴露撤销、重做、光标等操控句柄给外部工具栏
    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          const view = editorRef.current?.view;
          if (view) {
            return undo(view);
          }
          return false;
        },
        redo: () => {
          const view = editorRef.current?.view;
          if (view) {
            return redo(view);
          }
          return false;
        },
        canUndo: () => {
          const state = editorRef.current?.view?.state;
          return state ? undoDepth(state) > 0 : false;
        },
        canRedo: () => {
          const state = editorRef.current?.view?.state;
          return state ? redoDepth(state) > 0 : false;
        },
        focus: () => {
          editorRef.current?.view?.focus();
        },
        getView: () => editorRef.current?.view,
      }),
      [],
    );

    return (
      <div className={`cm-editor-container ${className}`}>
        <CodeMirror
          ref={editorRef}
          value={value}
          height="100%"
          style={{ height: "100%", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          theme="dark"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          extensions={extensions}
          onChange={onChange}
          onUpdate={handleUpdate}
          placeholder={placeholder}
          readOnly={readOnly}
          editable={!readOnly}
          autoFocus={autoFocus}
        />
      </div>
    );
  },
);
