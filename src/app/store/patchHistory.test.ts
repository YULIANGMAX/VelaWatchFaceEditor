import { describe, expect, it } from "vitest";
import { createBlankProject } from "../core/model";
import { applyHistoryPatch, type LayoutAttrPatch } from "./patchHistory";

describe("差量原子历史补丁 (applyHistoryPatch)", () => {
  it("正向重做与逆向撤销图层属性修改", () => {
    const project = createBlankProject("O66");
    const themeId = project.themes[0].id;
    project.themes[0].layouts.push({
      id: "l1",
      attrs: { ref: "@img", x: "10", y: "20" },
    });

    const patch: LayoutAttrPatch = {
      kind: "layout_attrs",
      themeId,
      layoutId: "l1",
      prevAttrs: { ref: "@img", x: "10", y: "20" },
      nextAttrs: { ref: "@img", x: "15", y: "20" },
    };

    // 1. 逆向应用 (Undo)
    project.themes[0].layouts[0].attrs.x = "15";
    const reverted = applyHistoryPatch(project, patch, true);
    expect(reverted.themes[0].layouts[0].attrs.x).toBe("10");

    // 2. 正向应用 (Redo)
    const redone = applyHistoryPatch(reverted, patch, false);
    expect(redone.themes[0].layouts[0].attrs.x).toBe("15");
  });

  it("正向重做与逆向撤销资源属性修改", () => {
    const project = createBlankProject("O66");
    project.resources.push({
      id: "res1",
      type: "Image",
      attrs: { name: "bg", src: "bg.png" },
      children: [],
    });

    const patch = {
      kind: "resource_attrs" as const,
      resourceId: "res1",
      prevAttrs: { name: "bg", src: "bg.png" },
      nextAttrs: { name: "bg", src: "bg2.png" },
    };

    project.resources[0].attrs.src = "bg2.png";
    const reverted = applyHistoryPatch(project, patch, true);
    expect(reverted.resources[0].attrs.src).toBe("bg.png");

    const redone = applyHistoryPatch(reverted, patch, false);
    expect(redone.resources[0].attrs.src).toBe("bg2.png");
  });

  it("正向重做与逆向撤销子项属性修改", () => {
    const project = createBlankProject("O66");
    project.resources.push({
      id: "res1",
      type: "Image",
      attrs: { name: "pointer" },
      children: [
        { id: "c1", attrs: { x: "10", y: "20" } },
      ],
    });

    const patch = {
      kind: "child_attrs" as const,
      resourceId: "res1",
      childId: "c1",
      prevAttrs: { x: "10", y: "20" },
      nextAttrs: { x: "10", y: "30" },
    };

    project.resources[0].children[0]!.attrs.y = "30";
    const reverted = applyHistoryPatch(project, patch, true);
    expect(reverted.resources[0].children[0]!.attrs.y).toBe("20");

    const redone = applyHistoryPatch(reverted, patch, false);
    expect(redone.resources[0].children[0]!.attrs.y).toBe("30");
  });
});
