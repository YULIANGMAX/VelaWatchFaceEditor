import { describe, expect, it } from "vitest";
import { createBlankProject } from "./model";
import { findDiagnosticTarget } from "./diagnosticNavigation";

describe("findDiagnosticTarget", () => {
  const project = createBlankProject();
  project.resources = [
    { id: "image", type: "Image", attrs: { name: "background", src: "background.png" }, children: [] },
    { id: "image-values", type: "DataItemImageValues", attrs: { name: "ImageValues1", source: "heartRate" }, children: [] },
    { id: "unnamed-pointer", type: "DataItemPointer", attrs: { source: "timeSecond" }, children: [] },
  ];
  project.themes[0].layouts = [
    { id: "layout-1", attrs: { ref: "@background", x: "0", y: "0" } },
    { id: "layout-2", attrs: { ref: "@background", x: "10", y: "10" } },
  ];

  it("定位资源、主题与带索引的布局", () => {
    expect(findDiagnosticTarget(project, "Resources/Image[@name='background']")).toEqual({ kind: "resource", resourceId: "image" });
    expect(findDiagnosticTarget(project, "Theme[@name='样式1']")).toEqual({ kind: "theme", themeId: project.themes[0].id });
    expect(findDiagnosticTarget(project, "Theme[@name='样式1']/Layout[2]")).toEqual({ kind: "layout", themeId: project.themes[0].id, layoutId: "layout-2" });
  });

  it("支持带有子路径、前导斜杠与双引号属性的诊断位置", () => {
    // 带子路径
    expect(findDiagnosticTarget(project, "Resources/DataItemImageValues[@name='ImageValues1']/Param[1]")).toEqual({ kind: "resource", resourceId: "image-values" });
    // 前导斜杠与双引号
    expect(findDiagnosticTarget(project, "/Resources/DataItemImageValues[@name=\"ImageValues1\"]")).toEqual({ kind: "resource", resourceId: "image-values" });
  });

  it("支持无名资源与未命名占位名回退", () => {
    expect(findDiagnosticTarget(project, "Resources/DataItemPointer[@name='?']")).toEqual({ kind: "resource", resourceId: "unnamed-pointer" });
    expect(findDiagnosticTarget(project, "Resources/DataItemPointer")).toEqual({ kind: "resource", resourceId: "unnamed-pointer" });
  });

  it("支持直接通过 Layout 索引定位", () => {
    expect(findDiagnosticTarget(project, "Layout[1]")).toEqual({ kind: "layout", themeId: project.themes[0].id, layoutId: "layout-1" });
  });

  it("无法细分位置时跳转到项目属性", () => {
    expect(findDiagnosticTarget(project, "项目文件")).toEqual({ kind: "project" });
    expect(findDiagnosticTarget(project, "/Watchface")).toEqual({ kind: "project" });
  });
});
