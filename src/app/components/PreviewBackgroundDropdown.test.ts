import { describe, expect, it } from "vitest";
import { PREVIEW_BG_OPTIONS } from "./PreviewBackgroundDropdown";
import { useEditorStore } from "../store/editorStore";

describe("PreviewBackgroundDropdown", () => {
  it("包含 4 种预设底色，默认浅色棋盘格", () => {
    expect(PREVIEW_BG_OPTIONS).toHaveLength(4);
    const keys = PREVIEW_BG_OPTIONS.map((opt) => opt.key);
    expect(keys).toEqual(["light-checker", "dark-checker", "black", "white"]);
    expect(PREVIEW_BG_OPTIONS.find((opt) => opt.key === "light-checker")?.label).toBe("浅色棋盘格");
    expect(PREVIEW_BG_OPTIONS.find((opt) => opt.key === "dark-checker")?.label).toBe("深色棋盘格");
    expect(PREVIEW_BG_OPTIONS.find((opt) => opt.key === "black")?.label).toBe("黑色");
    expect(PREVIEW_BG_OPTIONS.find((opt) => opt.key === "white")?.label).toBe("白色");
  });

  it("切换底色可更新 store 及 document 属性", () => {
    useEditorStore.getState().setPreviewBackground("black");
    expect(useEditorStore.getState().previewBackground).toBe("black");
    expect(document.documentElement.getAttribute("data-preview-bg")).toBe("black");

    useEditorStore.getState().setPreviewBackground("dark-checker");
    expect(useEditorStore.getState().previewBackground).toBe("dark-checker");
    expect(document.documentElement.getAttribute("data-preview-bg")).toBe("dark-checker");

    useEditorStore.getState().setPreviewBackground("white");
    expect(useEditorStore.getState().previewBackground).toBe("white");
    expect(document.documentElement.getAttribute("data-preview-bg")).toBe("white");

    useEditorStore.getState().setPreviewBackground("light-checker");
    expect(useEditorStore.getState().previewBackground).toBe("light-checker");
    expect(document.documentElement.getAttribute("data-preview-bg")).toBe("light-checker");
  });
});
