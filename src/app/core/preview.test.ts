import { describe, expect, it } from "vitest";
import { metricValue } from "./metrics";
import {
  absoluteItemAnchorTransform,
  arcPath,
  arcProgressClipAngles,
  centeredImageNumberLayout,
  clampProgress,
  formatImageNumber,
  linePoint,
  polarPoint,
  spriteFrameIndex,
  widgetChildAnchorTransform,
  widgetColumnPositions,
  widgetRowPositions,
  widgetVerticalPosition,
} from "./preview";

describe("表盘预览计算", () => {
  it("横向带单位图片数字按游标定位", () => {
    const item = (align: string): { align: string; width: number; unitWidth: number } => ({ align, width: 126, unitWidth: 50 });
    expect(widgetRowPositions(252, "center", 0, [item("center"), item("center")])).toEqual([0, 63]);
    expect(widgetRowPositions(252, "center", 0, [item("left"), item("center")])).toEqual([31.5, 94.5]);
    expect(widgetRowPositions(252, "center", 0, [item("left"), item("left")])).toEqual([0, 126]);
    expect(widgetRowPositions(252, "center", 0, [item("center"), item("left")])).toEqual([-31.5, 94.5]);
    expect(widgetRowPositions(252, "center", 0, [item("center")])).toEqual([31.5]);
    expect(widgetRowPositions(252, "flex-end", 0, [item("left"), item("left")])).toEqual([0, 126]);
    const shortItem = (align: string): { align: string; width: number; unitWidth: number } => ({ align, width: 88, unitWidth: 50 });
    expect(widgetRowPositions(252, "flex-end", 0, [shortItem("left"), item("left")])).toEqual([38, 126]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("center"), item("center")])).toEqual([28.5, 53.5]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("left"), item("center")])).toEqual([50.5, 75.5]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("left"), item("left")])).toEqual([19, 107]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("center"), item("left")])).toEqual([-3, 85]);

    // 真机实测验证：电量组件（右对齐数值 68px + 电池图标 24px，Widget 宽 300px）
    const batteryNum = { align: "right", width: 68, unitWidth: 0 };
    const batteryIcon = { align: undefined, width: 24, unitWidth: 0 };
    expect(widgetRowPositions(300, "flex-start", 0, [batteryNum, batteryIcon])).toEqual([-68, 0]);
    expect(widgetRowPositions(300, "center", 0, [batteryNum, batteryIcon])).toEqual([70, 138]);
    expect(widgetRowPositions(300, "flex-end", 0, [batteryNum, batteryIcon])).toEqual([208, 276]);
  });

  it("纵向列排布坐标计算（真机实测等差基准线与锚点）", () => {
    // 真机实测电量组件：w=88, h=100, justify_content="flex-end"
    // 子项 0：数值宽 68 高 26，align="right"
    // 子项 1：图标宽 24 高 24，无 align
    const num = { align: "right", width: 68, height: 26 };
    const icon = { align: undefined, width: 24, height: 24 };

    // 组件 19 (align_content="flex-start", align_items="flex-start") -> 向左偏移 maxItemWidth=68px
    expect(widgetColumnPositions(88, 100, "flex-end", "flex-start", "flex-start", 0, [num, icon])).toEqual([
      { x: -68, y: 50 },
      { x: 0, y: 76 },
    ]);

    // 组件 22 (align_content="center", align_items="flex-start") -> 向左偏移 maxItemWidth/2=34px
    expect(widgetColumnPositions(88, 100, "flex-end", "center", "flex-start", 0, [num, icon])).toEqual([
      { x: -34, y: 50 },
      { x: 34, y: 76 },
    ]);

    // 组件 25 (align_content="flex-end", align_items="flex-start") -> 偏移 0
    expect(widgetColumnPositions(88, 100, "flex-end", "flex-end", "flex-start", 0, [num, icon])).toEqual([
      { x: 0, y: 50 },
      { x: 68, y: 76 },
    ]);

    // 组件 26 (align_content="flex-end", align_items="center")
    expect(widgetColumnPositions(88, 100, "flex-end", "flex-end", "center", 0, [num, icon])).toEqual([
      { x: 10, y: 50 },
      { x: 66, y: 76 },
    ]);

    // 组件 27 (align_content="flex-end", align_items="flex-end")
    expect(widgetColumnPositions(88, 100, "flex-end", "flex-end", "flex-end", 0, [num, icon])).toEqual([
      { x: 20, y: 50 },
      { x: 64, y: 76 },
    ]);

    // 常规场景（无 align="right"）：居中与对齐
    const regular1 = { align: undefined, width: 40, height: 20 };
    const regular2 = { align: undefined, width: 60, height: 30 };
    expect(widgetColumnPositions(100, 100, "flex-start", "flex-start", "center", 10, [regular1, regular2])).toEqual([
      { x: 30, y: 0 },
      { x: 20, y: 30 },
    ]);
  });

  it("Widget 垂直对齐计算（align_content / align_items）", () => {
    // flex-start: 顶端贴齐 (y = 0)
    expect(widgetVerticalPosition("flex-start", 100, 26)).toBe(0);
    expect(widgetVerticalPosition(undefined, 100, 26)).toBe(0);
    // center: 以图片中线与容器中线对齐
    expect(widgetVerticalPosition("center", 100, 26)).toBe(37);
    expect(widgetVerticalPosition("center", 100, 24)).toBe(38);
    // flex-end: 图片底边紧贴矩形容器底边
    expect(widgetVerticalPosition("flex-end", 100, 26)).toBe(74);
    expect(widgetVerticalPosition("flex-end", 100, 24)).toBe(76);
  });

  it("Widget 按子项锚点定位", () => {
    expect(widgetChildAnchorTransform("row", "left", 126)).toBeUndefined();
    expect(widgetChildAnchorTransform("row", "center", 126)).toBe("translateX(-63px)");
    expect(widgetChildAnchorTransform("row", "right", 126)).toBe("translateX(-126px)");
    expect(widgetChildAnchorTransform("column", "left", 126)).toBeUndefined();
    expect(widgetChildAnchorTransform("column", "center", 126)).toBe("translateX(-63px)");
    expect(widgetChildAnchorTransform("column", "right", 126)).toBeUndefined();
  });

  it("绝对定位 Item 按资源锚点定位", () => {
    expect(absoluteItemAnchorTransform("left", 126)).toBeUndefined();
    expect(absoluteItemAnchorTransform("center", 126)).toBe("translateX(-63px)");
    expect(absoluteItemAnchorTransform("right", 126)).toBe("translateX(-126px)");
  });

  it("居中图片数字按实际显示宽度占位", () => {
    expect(centeredImageNumberLayout(2, 38, 0, 0, 0, 38)).toEqual({
      slotDigitsWidth: 76,
      componentWidth: 38,
      numberMarginLeft: 0,
      unitOffset: 38,
    });
    expect(centeredImageNumberLayout(2, 38, 0, 0, 0, 76)).toEqual({
      slotDigitsWidth: 76,
      componentWidth: 76,
      numberMarginLeft: 0,
      unitOffset: 76,
    });
  });

  it("按重复次数停止 Sprite", () => {
    expect(spriteFrameIndex(0, 100, 3, 2)).toBe(0);
    expect(spriteFrameIndex(350, 100, 3, 2)).toBe(0);
    expect(spriteFrameIndex(9999, 100, 3, 2)).toBe(2);
    expect(spriteFrameIndex(700, 100, 3, 0)).toBe(1);
  });

  it("格式化图片数字时遵守位数与补零", () => {
    expect(formatImageNumber(7, 2, 0, false, false)).toBe("7");
    expect(formatImageNumber(7, 2, 0, true, false)).toBe("07");
    expect(formatImageNumber(12.5, 5, 2, false, false)).toBe("12.5");
    expect(formatImageNumber(12.5, 5, 2, false, true)).toBe("12.50");
  });

  it("生成方向正确的圆弧和线性进度坐标", () => {
    expect(clampProgress(50, 0, 100)).toBe(0.5);
    expect(polarPoint(50, 50, 10, 0)).toEqual({ x: 50, y: 40 });
    expect(arcPath(50, 50, 10, 0, -90)).toContain(" 0 0 0 ");
    expect(linePoint(0, 10, 100, 30, 0.5)).toEqual({ x: 50, y: 20 });
  });

  it("带半圆背景轨道的圆弧进度前景应贴合素材轨迹", () => {
    expect(arcProgressClipAngles(-103, 193, true)).toEqual({ startAngle: -90, angleRange: 180 });
    expect(arcProgressClipAngles(-109, 199, true)).toEqual({ startAngle: -90, angleRange: 180 });
    expect(arcProgressClipAngles(-45, 180, true)).toEqual({ startAngle: -45, angleRange: 180 });
    expect(arcProgressClipAngles(-103, 193, false)).toEqual({ startAngle: -103, angleRange: 193 });
  });

  it("允许预览上下文覆盖设备指标", () => {
    expect(metricValue("healthStepCount", new Date(0), { healthStepCount: 1234 })).toBe(1234);
  });
});
