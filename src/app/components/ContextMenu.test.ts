import { describe, expect, it } from "vitest";
import { clampContextMenuPosition } from "./ContextMenu";

describe("ContextMenu 上下文菜单边界自适应", () => {
  it("屏幕中心正常展示无需位移", () => {
    const pos = clampContextMenuPosition(200, 200, 160, 240, 1000, 800);
    expect(pos).toEqual({ left: 200, top: 200 });
  });

  it("右侧超出视口时向左靠齐翻折", () => {
    // 视口宽 1000，菜单宽 160，右边距 8，右边界 1000 - 160 - 8 = 832
    const pos = clampContextMenuPosition(950, 100, 160, 200, 1000, 800);
    expect(pos.left).toBe(832);
    expect(pos.top).toBe(100);
  });

  it("下侧超出视口时向上靠齐翻折", () => {
    // 视口高 800，菜单高 240，下边距 8，下边界 800 - 240 - 8 = 552
    const pos = clampContextMenuPosition(100, 750, 160, 240, 1000, 800);
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(552);
  });
});
