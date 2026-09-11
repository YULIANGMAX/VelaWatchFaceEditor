import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export type ContextMenuEntry = ContextMenuItem | { type: "separator"; id?: string };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function clampContextMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  windowWidth: number,
  windowHeight: number,
  margin = 8,
): { left: number; top: number } {
  let left = x;
  let top = y;

  if (x + menuWidth > windowWidth - margin) {
    left = Math.max(margin, windowWidth - menuWidth - margin);
  }
  if (y + menuHeight > windowHeight - margin) {
    top = Math.max(margin, windowHeight - menuHeight - margin);
  }

  return { left, top };
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });

  // 边界自适应调整，防止超出视口
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const next = clampContextMenuPosition(
      x,
      y,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
    );
    setCoords(next);
  }, [x, y]);

  // 点击外部或按 Esc 键关闭
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handlePointerDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, index) => {
        if ("type" in entry && entry.type === "separator") {
          return <div key={entry.id ?? `sep-${index}`} className="context-menu-divider" role="separator" />;
        }
        const item = entry as ContextMenuItem;
        return (
          <button
            key={item.id}
            type="button"
            className={`context-menu-item${item.danger ? " is-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            <span className="context-menu-item-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="context-menu-item-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
