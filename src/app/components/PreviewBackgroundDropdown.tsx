import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useEditorStore, type PreviewBackground } from "../store/editorStore";

export interface PreviewBackgroundOption {
  key: PreviewBackground;
  label: string;
}

export const PREVIEW_BG_OPTIONS: PreviewBackgroundOption[] = [
  { key: "light-checker", label: "浅色棋盘格" },
  { key: "dark-checker", label: "深色棋盘格" },
  { key: "black", label: "黑色" },
  { key: "white", label: "白色" },
];

export function PreviewBackgroundDropdown() {
  const previewBackground = useEditorStore((state) => state.previewBackground);
  const setPreviewBackground = useEditorStore((state) => state.setPreviewBackground);
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const currentOption =
    PREVIEW_BG_OPTIONS.find((opt) => opt.key === previewBackground) ?? PREVIEW_BG_OPTIONS[0];

  const updatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: Math.round(rect.bottom + 6),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        (btnRef.current && btnRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen]);

  return (
    <div className="preview-bg-dropdown-container">
      <button
        ref={btnRef}
        type="button"
        className={`preview-bg-dropdown-btn${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="切换图片预览底色（不影响主画布）"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={`preview-bg-indicator is-${currentOption.key}`} aria-hidden="true" />
        <span className="preview-bg-btn-label">预览背景</span>
        <ChevronDown size={13} className={`preview-bg-chevron${isOpen ? " is-open" : ""}`} />
      </button>

      {isOpen && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="preview-bg-menu"
              role="listbox"
              aria-label="预览底色选择"
              style={{
                position: "fixed",
                top: `${menuPos.top}px`,
                right: `${menuPos.right}px`,
                zIndex: 99999,
              }}
            >
              {PREVIEW_BG_OPTIONS.map((opt) => {
                const isSelected = opt.key === previewBackground;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`preview-bg-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      setPreviewBackground(opt.key);
                      setIsOpen(false);
                    }}
                  >
                    <span className={`preview-bg-option-swatch is-${opt.key}`} aria-hidden="true" />
                    <span className="preview-bg-option-label">{opt.label}</span>
                    {isSelected ? <Check size={14} className="preview-bg-check" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
