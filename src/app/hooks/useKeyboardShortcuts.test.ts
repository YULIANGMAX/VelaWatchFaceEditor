import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useKeyboardShortcuts, type KeyboardShortcutsOptions } from "./useKeyboardShortcuts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHookWithReact(options: KeyboardShortcutsOptions) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function TestComponent({ opts }: { opts: KeyboardShortcutsOptions }) {
    useKeyboardShortcuts(opts);
    return null;
  }

  act(() => {
    root.render(React.createElement(TestComponent, { opts: options }));
  });

  return {
    rerender: (nextOpts: KeyboardShortcutsOptions) => {
      act(() => {
        root.render(React.createElement(TestComponent, { opts: nextOpts }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useKeyboardShortcuts", () => {
  const onSave = vi.fn<() => void>();
  const onUndo = vi.fn<() => void>();
  const onRedo = vi.fn<() => void>();
  const onNudge = vi.fn<(dx: number, dy: number) => void>();
  const onDelete = vi.fn<() => void>();
  const onDuplicate = vi.fn<() => void>();

  beforeEach(() => {
    onSave.mockReset();
    onUndo.mockReset();
    onRedo.mockReset();
    onNudge.mockReset();
    onDelete.mockReset();
    onDuplicate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应支持 Ctrl+S 触发保存", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    hook.unmount();
  });

  it("应支持 Ctrl+Z / Ctrl+Y 触发撤销与重做", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    // 撤销
    const undoEvent = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(undoEvent);
    expect(onUndo).toHaveBeenCalledTimes(1);

    // 重做
    const redoEvent = new KeyboardEvent("keydown", {
      key: "y",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(redoEvent);
    expect(onRedo).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("应支持方向键 1px 微移与 Shift+方向键 10px 跨步微移", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    // 左移 1px
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })
    );
    expect(onNudge).toHaveBeenLastCalledWith(-1, 0);

    // 右移 10px (Shift)
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(onNudge).toHaveBeenLastCalledWith(10, 0);

    // 上移 1px
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })
    );
    expect(onNudge).toHaveBeenLastCalledWith(0, -1);

    // 下移 10px (Shift)
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(onNudge).toHaveBeenLastCalledWith(0, 10);
    hook.unmount();
  });

  it("应支持 Delete / Backspace 触发删除", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
    );
    expect(onDelete).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
    );
    expect(onDelete).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("应支持 Ctrl+D 快速克隆", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true })
    );
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("当目标为文本输入框时，应放行原生操作，不触发微调与删除", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
    });

    const input = document.createElement("input");
    document.body.appendChild(input);

    const deleteEvent = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(deleteEvent);

    expect(onDelete).not.toHaveBeenCalled();
    expect(deleteEvent.defaultPrevented).toBe(false);

    const arrowEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(arrowEvent);
    expect(onNudge).not.toHaveBeenCalled();

    input.remove();
    hook.unmount();
  });

  it("当 disabled 为 true 时，不响应任何快捷键", () => {
    const hook = renderHookWithReact({
      onSave,
      onUndo,
      onRedo,
      onNudge,
      onDelete,
      onDuplicate,
      disabled: true,
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onNudge).not.toHaveBeenCalled();
    hook.unmount();
  });
});
