import { describe, expect, it } from "vitest";
import { createBlankProject } from "./model";
import { findDiagnosticTarget } from "./diagnosticNavigation";

describe("findDiagnosticTarget", () => {
  const project = createBlankProject();
  project.resources = [{ id: "image", type: "Image", attrs: { name: "background", src: "background.png" }, children: [] }];
  project.themes[0].layouts = [
    { id: "layout-1", attrs: { ref: "@background", x: "0", y: "0" } },
    { id: "layout-2", attrs: { ref: "@background", x: "10", y: "10" } },
  ];

  it("定位资源、主题与带索引的布局", () => {
    expect(findDiagnosticTarget(project, "Resources/Image[@name='background']")).toEqual({ kind: "resource", resourceId: "image" });
    expect(findDiagnosticTarget(project, "Theme[@name='样式1']")).toEqual({ kind: "theme", themeId: project.themes[0].id });
    expect(findDiagnosticTarget(project, "Theme[@name='样式1']/Layout[2]")).toEqual({ kind: "layout", themeId: project.themes[0].id, layoutId: "layout-2" });
  });

  it("无法细分位置时跳转到项目属性", () => {
    expect(findDiagnosticTarget(project, "项目文件")).toEqual({ kind: "project" });
  });
});
