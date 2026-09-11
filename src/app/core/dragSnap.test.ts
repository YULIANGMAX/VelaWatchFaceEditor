import { describe, expect, it } from "vitest";
import { dragCoordinate } from "../components/CanvasStage";

describe("拖拽吸附算法 (dragCoordinate) 测试", () => {
  it("无网格模式：四舍五入到整数像素", () => {
    expect(dragCoordinate(123.4, "none", 480, 150)).toBe(123);
    expect(dragCoordinate(123.6, "none", 480, 150)).toBe(124);
  });

  it("左上原点 (0, 0) 模式：按 10px 网格吸附", () => {
    expect(dragCoordinate(124, "corner", 480, 150)).toBe(120);
    expect(dragCoordinate(126, "corner", 480, 150)).toBe(130);
  });

  describe("中心原点 (Center) 模式：按元素中心点对齐中心网格", () => {
    const canvasWidth = 480; // 中心是 240

    it("宽度 150 的控件（默认左对齐），拖到中线附近精准居中吸附到 165", () => {
      // 居中时，左边应该在 240 - 75 = 165，右边在 315，中心在 240
      expect(dragCoordinate(163, "center", canvasWidth, 150, 0)).toBe(165);
      expect(dragCoordinate(167, "center", canvasWidth, 150, 0)).toBe(165);
      expect(dragCoordinate(165, "center", canvasWidth, 150, 0)).toBe(165);

      // 拖到中线右侧 10px 处，中心是 250，左边应该在 250 - 75 = 175
      expect(dragCoordinate(174, "center", canvasWidth, 150, 0)).toBe(175);
      expect(dragCoordinate(176, "center", canvasWidth, 150, 0)).toBe(175);
    });

    it("宽度 100 的控件（默认左对齐），拖到中线附近精准居中吸附到 190", () => {
      // 居中时，左边在 240 - 50 = 190
      expect(dragCoordinate(192, "center", canvasWidth, 100, 0)).toBe(190);
      expect(dragCoordinate(188, "center", canvasWidth, 100, 0)).toBe(190);
    });

    it("设置了 align='center' 的控件（中心锚点），拖到中线附近精准吸附到 240", () => {
      // 居中锚点：rawValue 就是中心
      expect(dragCoordinate(238, "center", canvasWidth, 150, 0.5)).toBe(240);
      expect(dragCoordinate(243, "center", canvasWidth, 150, 0.5)).toBe(240);
    });

    it("设置了 align='right' 的控件（右侧锚点），拖到中线附近精准居中吸附到 315", () => {
      // 居中时，右边在 240 + 75 = 315
      expect(dragCoordinate(313, "center", canvasWidth, 150, 1)).toBe(315);
      expect(dragCoordinate(317, "center", canvasWidth, 150, 1)).toBe(315);
    });

    it("小方屏画布 368（中心 184），宽度 150 的控件居中时吸附到 109", () => {
      // 184 - 75 = 109
      expect(dragCoordinate(108, "center", 368, 150, 0)).toBe(109);
      expect(dragCoordinate(111, "center", 368, 150, 0)).toBe(109);
    });
  });
});
