import { describe, expect, it } from "vitest";
import { computeSmartGuides, type RectBox } from "./smartGuides";

describe("智能对齐磁吸辅助线 (computeSmartGuides)", () => {
  const canvasSize = { width: 480, height: 480 };

  it("当距离画布中心线在阈值内时，自动吸附到中心线并生成参考线", () => {
    // 宽度 100，拖到 x = 188（中心为 238），画布中心为 240，差 2px 在阈值 (4px) 内
    const dragging = { x: 188, y: 100, width: 100, height: 50 };
    const result = computeSmartGuides(dragging, [], canvasSize, 4);

    // 吸附后中心为 240，左边缘为 240 - 50 = 190
    expect(result.snappedX).toBe(190);
    expect(result.verticalGuides).toContain(240);
  });

  it("当靠近其他图层左边缘时，精准左对齐吸附", () => {
    const others: RectBox[] = [
      { id: "node1", x: 120, y: 200, width: 80, height: 40 },
    ];
    // 拖动元素 x = 122，靠近 node1.x (120)
    const dragging = { x: 122, y: 50, width: 60, height: 60 };
    const result = computeSmartGuides(dragging, others, canvasSize, 4);

    expect(result.snappedX).toBe(120);
    expect(result.verticalGuides).toContain(120);
  });

  it("当超出阈值时，不产生吸附并保留原坐标", () => {
    const others: RectBox[] = [
      { id: "node1", x: 120, y: 200, width: 80, height: 40 },
    ];
    // 拖动元素 x = 135，距离 120 超过 4px
    const dragging = { x: 135, y: 50, width: 60, height: 60 };
    const result = computeSmartGuides(dragging, others, canvasSize, 4);

    expect(result.snappedX).toBe(135);
    expect(result.verticalGuides.length).toBe(0);
  });

  it("支持 Y 轴顶边缘与中心线吸附", () => {
    const others: RectBox[] = [
      { id: "node1", x: 50, y: 150, width: 50, height: 100 },
    ];
    // y = 149，靠近 node1.y (150)
    const dragging = { x: 50, y: 149, width: 50, height: 80 };
    const result = computeSmartGuides(dragging, others, canvasSize, 4);

    expect(result.snappedY).toBe(150);
    expect(result.horizontalGuides).toContain(150);
  });
});
