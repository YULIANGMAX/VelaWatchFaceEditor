import { describe, expect, it } from "vitest";
import { clampToolbarPosition, computeCenterCoordinates, isResourceTimeDependent, layoutAnchorOffsetFactor, layoutAnchorTransform } from "./CanvasStage";
import { createBlankProject } from "../core/model";

describe("画布顶层布局锚点与性能优化", () => {
  it("精准计算元素水平与垂直居中坐标", () => {
    const canvas = { width: 480, height: 480 };
    // 默认左对齐 (align=undefined 或 left)
    expect(computeCenterCoordinates(canvas, { width: 100, height: 60 })).toEqual({ x: 190, y: 210 });
    // 中心对齐 (align=center)
    expect(computeCenterCoordinates(canvas, { width: 100, height: 60, align: "center" })).toEqual({ x: 240, y: 210 });
    // 右对齐 (align=right)
    expect(computeCenterCoordinates(canvas, { width: 100, height: 60, align: "right" })).toEqual({ x: 290, y: 210 });
  });

  it("按资源 align 对齐布局坐标", () => {
    expect(layoutAnchorOffsetFactor("left")).toBe(0);
    expect(layoutAnchorOffsetFactor("center")).toBe(0.5);
    expect(layoutAnchorOffsetFactor("right")).toBe(1);
    expect(layoutAnchorTransform("left")).toBeUndefined();
    expect(layoutAnchorTransform("center")).toBe("translateX(-50%)");
    expect(layoutAnchorTransform("right")).toBe("translateX(-100%)");
    expect(layoutAnchorOffsetFactor("center", "DataItemText")).toBe(0);
    expect(layoutAnchorTransform("center", "DataItemText")).toBeUndefined();
    expect(layoutAnchorTransform("right", "DataItemText")).toBeUndefined();
  });

  it("精准判定时变敏感资源与静态免重绘资源", () => {
    const project = createBlankProject("O66");
    project.resources = [
      { id: "1", type: "Image", attrs: { name: "bg_img", src: "bg.png" }, children: [] },
      { id: "2", type: "Sprite", attrs: { name: "anim_sprite" }, children: [] },
      { id: "3", type: "Pointer", attrs: { name: "sec_hand", source: "timeSecond" }, children: [] },
      { id: "4", type: "DataItemImageNumber", attrs: { name: "clock_hour", source: "timeHour" }, children: [] },
      { id: "5", type: "DataItemImageNumber", attrs: { name: "step_counter", source: "stepCount" }, children: [] },
      {
        id: "6",
        type: "Widget",
        attrs: { name: "clock_widget" },
        children: [{ id: "c1", attrs: { ref: "@anim_sprite" } }],
      },
      {
        id: "7",
        type: "Widget",
        attrs: { name: "static_widget" },
        children: [{ id: "c2", attrs: { ref: "@bg_img" } }],
      },
    ];

    // 静态背景图：非时变
    expect(isResourceTimeDependent(project, "@bg_img")).toBe(false);
    // 静态嵌套 Widget：非时变
    expect(isResourceTimeDependent(project, "@static_widget")).toBe(false);

    // Sprite 序列帧动画：时变
    expect(isResourceTimeDependent(project, "@anim_sprite")).toBe(true);
    // 指针：时变
    expect(isResourceTimeDependent(project, "@sec_hand")).toBe(true);
    // 时间指标数字：时变
    expect(isResourceTimeDependent(project, "@clock_hour")).toBe(true);
    // 包含动画的复合 Widget：递归判定为时变
    expect(isResourceTimeDependent(project, "@clock_widget")).toBe(true);
  });

  it("拖动浮动工具条时坐标限制在视口边框内", () => {
    const frameSize = { width: 800, height: 600 };
    const toolbarSize = { width: 40, height: 200 };

    // 正常范围内保持原值
    expect(clampToolbarPosition({ x: 100, y: 150 }, frameSize, toolbarSize)).toEqual({ x: 100, y: 150 });

    // 负坐标吸附到边界边距 (8)
    expect(clampToolbarPosition({ x: -20, y: -5 }, frameSize, toolbarSize)).toEqual({ x: 8, y: 8 });

    // 超出右边界吸附 (800 - 40 - 8 = 752)
    expect(clampToolbarPosition({ x: 900, y: 200 }, frameSize, toolbarSize)).toEqual({ x: 752, y: 200 });

    // 超出下边界吸附 (600 - 200 - 8 = 392)
    expect(clampToolbarPosition({ x: 100, y: 800 }, frameSize, toolbarSize)).toEqual({ x: 100, y: 392 });
  });
});

