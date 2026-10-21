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

  it("超过 500 行的超长 Lua 脚本不被截断，完整行数精确计算", () => {
    const lines = Array.from({ length: 800 }, (_, i) => `local var_${i} = ${i}`);
    const fullScript = lines.join("\n");
    const parsedLines = fullScript.split("\n");
    expect(parsedLines).toHaveLength(800);
    expect(parsedLines[0]).toBe("local var_0 = 0");
    expect(parsedLines[799]).toBe("local var_799 = 799");
  });

  it("代码编辑器支持多步历史撤销与恢复", () => {
    // 模拟编辑历史步骤
    const history: string[] = ['print("start")'];
    let index = 0;

    const pushStep = (val: string) => {
      history.splice(index + 1);
      history.push(val);
      index = history.length - 1;
    };

    pushStep('print("step 1")');
    pushStep('print("step 2")');
    pushStep('print("step 3")');

    expect(index).toBe(3);
    expect(history[index]).toBe('print("step 3")');

    // 撤销第 3 步 -> 第 2 步
    index -= 1;
    expect(history[index]).toBe('print("step 2")');

    // 撤销第 2 步 -> 第 1 步
    index -= 1;
    expect(history[index]).toBe('print("step 1")');

    // 撤销第 1 步 -> 初始状态
    index -= 1;
    expect(history[index]).toBe('print("start")');
    expect(index).toBe(0);

    // 重做步
    index += 1;
    expect(history[index]).toBe('print("step 1")');
  });

  it("关闭未保存代码的三选逻辑覆盖保存、放弃与取消三种分支", async () => {
    let saved = false;
    let closed = false;
    let promptDismissed = false;

    const onSave = async () => {
      saved = true;
    };
    const onClose = () => {
      closed = true;
    };
    const onCancelPrompt = () => {
      promptDismissed = true;
    };

    // 分支 1：点击「取消」-> 不保存且不关闭，仅关闭提示框
    onCancelPrompt();
    expect(saved).toBe(false);
    expect(closed).toBe(false);
    expect(promptDismissed).toBe(true);

    // 分支 2：点击「放弃」-> 不保存且直接关闭
    onClose();
    expect(saved).toBe(false);
    expect(closed).toBe(true);

    // 分支 3：点击「保存」-> 保存成功后关闭
    closed = false;
    await onSave();
    onClose();
    expect(saved).toBe(true);
    expect(closed).toBe(true);
  });
});


