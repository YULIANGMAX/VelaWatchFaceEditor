import { describe, expect, it } from "vitest";
import { createBlankProject, type WatchfaceResource } from "./model";
import { getWidgetEffectiveSize, measureResource } from "./measure";

describe("measure 尺寸测量引擎测试", () => {
  it("Sprite、Slot 和进度条沿用引用资源的尺寸", () => {
    const project = createBlankProject("O66");
    project.assets["frame.png"] = {
      path: "frame.png", url: "", width: 40, height: 20, blob: new Blob(), imageMetadataLoaded: true,
    };
    project.resources.push(
      { id: "array", type: "ImageArray", attrs: { name: "frames" }, children: [{ id: "frame", attrs: { src: "frame.png" } }] },
      { id: "sprite", type: "Sprite", attrs: { name: "animation", ref: "@frames" }, children: [] },
      { id: "slot", type: "Slot", attrs: { name: "slot", type: "widget" }, children: [{ id: "slot-item", attrs: { ref: "@animation" } }] },
      { id: "progress", type: "DataItemLineProgressBar", attrs: { name: "progress", ref: "@frames" }, children: [] },
    );

    expect(measureResource(project, project.resources.find((resource) => resource.id === "sprite"))).toEqual({ width: 40, height: 20 });
    expect(measureResource(project, project.resources.find((resource) => resource.id === "slot"))).toEqual({ width: 40, height: 20 });
    expect(measureResource(project, project.resources.find((resource) => resource.id === "progress"))).toEqual({ width: 40, height: 20 });
  });

  it("正确测量 Image 与 ImageArray 尺寸", () => {
    const project = createBlankProject("O66");
    project.assets["images/bg.png"] = {
      path: "images/bg.png",
      url: "blob:bg",
      width: 100,
      height: 50,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };
    project.assets["images/icon1.png"] = {
      path: "images/icon1.png",
      url: "blob:icon1",
      width: 20,
      height: 24,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };
    project.assets["images/icon2.png"] = {
      path: "images/icon2.png",
      url: "blob:icon2",
      width: 25,
      height: 30,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };

    const imageRes: WatchfaceResource = {
      id: "res-img",
      type: "Image",
      attrs: { name: "BgImage", src: "images/bg.png" },
      children: [],
    };
    const arrayRes: WatchfaceResource = {
      id: "res-array",
      type: "ImageArray",
      attrs: { name: "NumArray" },
      children: [
        { id: "c1", attrs: { src: "images/icon1.png" } },
        { id: "c2", attrs: { src: "images/icon2.png" } },
      ],
    };
    project.resources.push(imageRes, arrayRes);

    expect(measureResource(project, imageRes)).toEqual({ width: 100, height: 50 });
    // ImageArray 取最大单帧尺寸
    expect(measureResource(project, arrayRes)).toEqual({ width: 25, height: 30 });
  });

  it("正确测量 DataItemImageNumber 宽度（位数 + 间距 + 单位）", () => {
    const project = createBlankProject("O66");
    project.assets["images/digit.png"] = {
      path: "images/digit.png",
      url: "blob:digit",
      width: 15,
      height: 20,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };
    project.assets["images/unit.png"] = {
      path: "images/unit.png",
      url: "blob:unit",
      width: 10,
      height: 12,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };

    project.resources.push(
      {
        id: "res-array",
        type: "ImageArray",
        attrs: { name: "Digits" },
        children: [{ id: "c1", attrs: { src: "images/digit.png" } }],
      },
      {
        id: "res-unit",
        type: "Image",
        attrs: { name: "PercentUnit", src: "images/unit.png" },
        children: [],
      },
    );

    const numberRes: WatchfaceResource = {
      id: "res-num",
      type: "DataItemImageNumber",
      attrs: {
        name: "BatteryNum",
        ref: "@Digits",
        totalDigits: "3",
        space: "2",
        unitIcon: "@PercentUnit",
      },
      children: [],
    };
    project.resources.push(numberRes);

    // 3 位数字 = 3 * 15 = 45; 2 个字符间距 = 2 * 2 = 4;
    // 单位 = 10 + 间距 2 = 12;
    // 总宽 = 45 + 4 + 12 = 61; 总高 = max(20, 12) = 20
    const dim = measureResource(project, numberRes);
    expect(dim.width).toBe(61);
    expect(dim.height).toBe(20);

    // 测试带小数与小数点负偏移的数字测量（如 23.5：4字符，1小数位，-10偏移，单字宽20 -> 70）
    const decimalNumRes: WatchfaceResource = {
      id: "res-dec-num",
      type: "DataItemImageNumber",
      attrs: {
        name: "SleepDurationNum",
        ref: "@Digits",
        totalDigits: "4",
        decimalDigits: "1",
        decimalOffsetX: "-10",
        space: "0",
      },
      children: [],
    };
    // 这里 单字宽 15：4 * 15 + (-10) = 50
    expect(measureResource(project, decimalNumRes).width).toBe(50);
  });

  it("正确测量 Widget 流式排版与有效尺寸推导", () => {
    const project = createBlankProject("O66");
    project.assets["images/a.png"] = {
      path: "images/a.png",
      url: "blob:a",
      width: 40,
      height: 30,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };
    project.assets["images/b.png"] = {
      path: "images/b.png",
      url: "blob:b",
      width: 50,
      height: 20,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };

    project.resources.push(
      {
        id: "img-a",
        type: "Image",
        attrs: { name: "ImageA", src: "images/a.png" },
        children: [],
      },
      {
        id: "img-b",
        type: "Image",
        attrs: { name: "ImageB", src: "images/b.png" },
        children: [],
      },
    );

    const widgetFlex: WatchfaceResource = {
      id: "w-flex",
      type: "Widget",
      attrs: {
        name: "FlexWidget",
        flex_direction: "row",
        gap: "10",
      },
      children: [
        { id: "c1", attrs: { ref: "@ImageA" } },
        { id: "c2", attrs: { ref: "@ImageB" } },
      ],
    };
    project.resources.push(widgetFlex);

    // 行弹性盒：40 + 10(gap) + 50 = 100 宽，高度 max(30, 20) = 30
    expect(measureResource(project, widgetFlex)).toEqual({ width: 100, height: 30 });
    expect(getWidgetEffectiveSize(project, widgetFlex)).toEqual({ width: 100, height: 30 });

    // 若显式指定了 w / h，则 getWidgetEffectiveSize 优先返回指定值
    widgetFlex.attrs.w = "250";
    expect(getWidgetEffectiveSize(project, widgetFlex)).toEqual({ width: 250, height: 30 });
  });

  it("当子组件显式指定了 w/h 时，父组件排版测量优先采用子组件指定的尺寸", () => {
    const project = createBlankProject("O66");
    project.assets["images/icon.png"] = {
      path: "images/icon.png",
      url: "blob:icon",
      width: 60,
      height: 30,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };

    // 子组件 A：内容宽 60，但用户手动指定了 w=70
    const childWidgetA: WatchfaceResource = {
      id: "w-a",
      type: "Widget",
      attrs: {
        name: "WidgetA",
        w: "70",
      },
      children: [{ id: "c1", attrs: { ref: "@Icon" } }],
    };

    const iconRes: WatchfaceResource = {
      id: "res-icon",
      type: "Image",
      attrs: { name: "Icon", src: "images/icon.png" },
      children: [],
    };

    // 父组件 B：包含子组件 A 和另一张 20 宽的图，row 排版
    project.assets["images/dot.png"] = {
      path: "images/dot.png",
      url: "blob:dot",
      width: 20,
      height: 20,
      blob: new Blob(),
      imageMetadataLoaded: true,
    };
    const dotRes: WatchfaceResource = {
      id: "res-dot",
      type: "Image",
      attrs: { name: "Dot", src: "images/dot.png" },
      children: [],
    };

    const parentWidgetB: WatchfaceResource = {
      id: "w-b",
      type: "Widget",
      attrs: {
        name: "WidgetB",
        flex_direction: "row",
        gap: "5",
      },
      children: [
        { id: "p1", attrs: { ref: "@WidgetA" } },
        { id: "p2", attrs: { ref: "@Dot" } },
      ],
    };

    project.resources.push(iconRes, dotRes, childWidgetA, parentWidgetB);

    // 父组件 B 宽度应为: WidgetA(显式指定的 70) + gap(5) + Dot(20) = 95（而不是按 60 + 5 + 20 = 85 计算）
    const dimB = measureResource(project, parentWidgetB);
    expect(dimB.width).toBe(95);
  });
});

