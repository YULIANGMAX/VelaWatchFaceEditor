import { describe, expect, it } from "vitest";
import { createBlankProject } from "../core/model";
import {
  findAssetReferences,
  formatFileSizeKB,
  getAssetTypeBadge,
  isTextAsset,
  labelForAssetReference,
} from "./AssetInspector";

describe("AssetInspector - 统一引用追踪", () => {
  it("无引用时返回空数组", () => {
    const project = createBlankProject();
    const refs = findAssetReferences(project, "images/unreferenced.png");
    expect(refs).toEqual([]);
  });

  it("可追踪表盘根配置中引用的资源路径", () => {
    const project = createBlankProject();
    project.watchface.preview = "images/preview.png";

    const refs = findAssetReferences(project, "images/preview.png");
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("watchface");
    expect(refs[0].selection).toEqual({ kind: "project" });
    expect(labelForAssetReference(refs[0])).toBe("表盘属性 · 预览图片");
  });

  it("可追踪主题中引用的资源路径", () => {
    const project = createBlankProject();
    project.themes[0]!.attrs.name = "默认主题";
    project.themes[0]!.attrs.preview = "images/theme_preview.png";

    const refs = findAssetReferences(project, "images/theme_preview.png");
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("theme");
    expect(refs[0].selection).toEqual({ kind: "theme", themeId: project.themes[0]!.id });
    expect(labelForAssetReference(refs[0])).toBe("主题「默认主题」· 预览图片");
  });

  it("可追踪资源属性和子项中引用的资源路径", () => {
    const project = createBlankProject();
    project.resources.push({
      id: "res-img",
      type: "Image",
      attrs: { name: "bg_img", src: "images/bg.png", w: "466", h: "466" },
      children: [],
    });
    project.resources.push({
      id: "res-arr",
      type: "ImageArray",
      attrs: { name: "num_arr" },
      children: [
        { id: "child-0", attrs: { src: "images/num_0.png" } },
        { id: "child-1", attrs: { src: "images/num_1.png" } },
      ],
    });

    // 检查 bg.png
    const bgRefs = findAssetReferences(project, "images/bg.png");
    expect(bgRefs).toHaveLength(1);
    expect(bgRefs[0].kind).toBe("resource");
    expect(bgRefs[0].selection).toEqual({ kind: "resource", resourceId: "res-img" });
    expect(labelForAssetReference(bgRefs[0])).toBe("图片「bg_img」· 资源路径");

    // 检查 num_0.png
    const num0Refs = findAssetReferences(project, "images/num_0.png");
    expect(num0Refs).toHaveLength(1);
    expect(num0Refs[0].kind).toBe("child");
    expect(num0Refs[0].selection).toEqual({ kind: "resource", resourceId: "res-arr" });
    expect(labelForAssetReference(num0Refs[0])).toBe("图片序列「num_arr」· 子项 1 · 资源路径");

    // 路径反斜杠兼容性测试
    const backslashRefs = findAssetReferences(project, "images\\bg.png");
    expect(backslashRefs).toHaveLength(1);
    expect(backslashRefs[0].selection).toEqual({ kind: "resource", resourceId: "res-img" });
  });

  it("formatFileSizeKB 仅显示 KB 数，不写字节数", () => {
    expect(formatFileSizeKB(0)).toBe("0 KB");
    expect(formatFileSizeKB(51054)).toBe("49.86 KB");
    expect(formatFileSizeKB(1024)).toBe("1.00 KB");
    expect(formatFileSizeKB(500)).toBe("0.49 KB");
  });

  it("isTextAsset 正确识别脚本与文本文件", () => {
    expect(isTextAsset("lua/main.lua")).toBe(true);
    expect(isTextAsset("config.json")).toBe(true);
    expect(isTextAsset("data.xml")).toBe(true);
    expect(isTextAsset("notes.txt")).toBe(true);
    expect(isTextAsset("image.png")).toBe(false);
    expect(isTextAsset("binary.bin")).toBe(false);
  });

  it("getAssetTypeBadge 正确标定各类文件", () => {
    expect(getAssetTypeBadge("main.lua", false, true).category).toBe("lua");
    expect(getAssetTypeBadge("data.json", false, true).category).toBe("data");
    expect(getAssetTypeBadge("raw.bin", false, false).category).toBe("binary");
    expect(getAssetTypeBadge("icon.png", true, false).category).toBe("image");
  });
});


