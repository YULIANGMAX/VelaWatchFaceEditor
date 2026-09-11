import { describe, expect, it } from "vitest";
import { createBlankProject } from "../core/model";
import { findResourceReferences } from "./resourceReferences";

describe("findResourceReferences", () => {
  it("仅列出格式定义中的显式资源引用，并保留跳转目标", () => {
    const project = createBlankProject("O66");
    const image = { id: "image", type: "Image" as const, attrs: { name: "target", src: "target.png" }, children: [] };
    const widget = {
      id: "widget",
      type: "Widget" as const,
      attrs: { name: "widget", preview: "@target", text: "@target" },
      children: [{ id: "child", attrs: { ref: "@target" } }],
    };
    project.resources = [image, widget];
    project.watchface.name = "@target";
    project.themes[0].attrs.preview = "@target";
    project.themes[0].layouts = [{ id: "layout", attrs: { ref: "@target", x: "0", y: "0" } }];

    expect(findResourceReferences(project, image)).toEqual([
      { kind: "watchface", fieldLabel: "表盘名称" },
      { kind: "theme", themeId: project.themes[0].id, themeName: "样式1", fieldLabel: "预览图片" },
      { kind: "layout", themeId: project.themes[0].id, themeName: "样式1", layoutId: "layout" },
      { kind: "resource", resourceId: "widget", resourceName: "widget", resourceType: "组合组件", fieldLabel: "组件预览图" },
      { kind: "child", resourceId: "widget", resourceName: "widget", resourceType: "组合组件", childIndex: 0, fieldLabel: "引用资源" },
    ]);
  });
});
