import { useEffect } from "react";

export interface KeyboardShortcutsOptions {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onNudge?: (dx: number, dy: number) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onSave,
  onUndo,
  onRedo,
  onNudge,
  onDelete,
  onDuplicate,
  disabled = false,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 避免在文本输入框中拦截输入行为
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      // 1. Ctrl + S / Cmd + S (保存)
      if (ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave?.();
        return;
      }

      // 如果在输入框内，保留原生输入行为（原生文本选择、撤销、方向键微移文本光标、删除等）
      if (isInput) return;

      // 2. Ctrl + Z / Cmd + Z (撤销)
      if (ctrlKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }

      // 3. Ctrl + Y / Cmd + Y 或者 Ctrl + Shift + Z (重做)
      if (
        ctrlKey &&
        (event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        onRedo?.();
        return;
      }

      // 4. Ctrl + D / Cmd + D (克隆选中项)
      if (ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        onDuplicate?.();
        return;
      }

      // 5. Delete 或 Backspace (删除选中项)
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete?.();
        return;
      }

      // 6. 方向键微调 ArrowUp / ArrowDown / ArrowLeft / ArrowRight
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowLeft") dx = -step;
        else if (event.key === "ArrowRight") dx = step;
        else if (event.key === "ArrowUp") dy = -step;
        else if (event.key === "ArrowDown") dy = step;

        onNudge?.(dx, dy);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onUndo, onRedo, onNudge, onDelete, onDuplicate, disabled]);
}
