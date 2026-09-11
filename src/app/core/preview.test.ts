import { describe, expect, it } from "vitest";
import { metricValue } from "./metrics";
import { absoluteItemAnchorTransform, arcPath, arcProgressClipAngles, centeredImageNumberLayout, clampProgress, formatImageNumber, linePoint, polarPoint, spriteFrameIndex, widgetChildAnchorTransform, widgetRowPositions } from "./preview";

describe("表盘预览计算", () => {
  it("横向带单位图片数字按游标定位", () => {
    const item = (align: string): { align: string; width: number; unitWidth: number } => ({ align, width: 126, unitWidth: 50 });
    expect(widgetRowPositions(252, "center", 0, [item("center"), item("center")])).toEqual([0, 63]);
    expect(widgetRowPositions(252, "center", 0, [item("left"), item("center")])).toEqual([25, 88]);
    expect(widgetRowPositions(252, "center", 0, [item("left"), item("left")])).toEqual([0, 126]);
    expect(widgetRowPositions(252, "center", 0, [item("center"), item("left")])).toEqual([-38, 88]);
    expect(widgetRowPositions(252, "center", 0, [item("center")])).toEqual([25]);
    expect(widgetRowPositions(252, "flex-end", 0, [item("left"), item("left")])).toEqual([0, 126]);
    const shortItem = (align: string): { align: string; width: number; unitWidth: number } => ({ align, width: 88, unitWidth: 50 });
    expect(widgetRowPositions(252, "center", 0, [shortItem("center"), item("center")])).toEqual([25, 50]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("left"), item("center")])).toEqual([44, 69]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("left"), item("left")])).toEqual([19, 107]);
    expect(widgetRowPositions(252, "center", 0, [shortItem("center"), item("left")])).toEqual([0, 88]);
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
