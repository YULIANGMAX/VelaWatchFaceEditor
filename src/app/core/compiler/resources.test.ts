import { describe, expect, it } from "vitest";
import { getDeviceDefinition } from "../../device-definition";
import type { WatchfaceResource } from "../model";
import { encodeDataResource, encodeSlot, encodeWidget } from "./resources";

describe("Slot 二进制编码", () => {
  it("编码标准 widget 槽位", () => {
    const slot: WatchfaceResource = {
      id: "slot1",
      type: "Slot",
      attrs: { name: "Slot1", type: "widget" },
      children: [
        { id: "i1", tag: "Item", attrs: { ref: "@w1" } },
        { id: "i2", tag: "Item", attrs: { ref: "@w2" } },
      ],
    };
    const resolve = (ref: string | undefined) => (ref === "@w1" ? { index: 1, type: 9 } : { index: 2, type: 9 });
    const bytes = encodeSlot(slot, resolve);
    expect(Array.from(bytes)).toEqual([
      2, 0, 0, 0,
      1, 0, 0, 9,
      2, 0, 0, 9,
    ]);
  });

  it("编码可移动槽位（movable=true）与候选预设坐标（Position）", () => {
    const slot: WatchfaceResource = {
      id: "slot1",
      type: "Slot",
      attrs: { name: "Slot1", type: "widget", movable: "true" },
      children: [
        { id: "i1", tag: "Item", attrs: { ref: "@w2" } },
        { id: "p1", tag: "Position", attrs: { x: "72", y: "199" } },
        { id: "p2", tag: "Position", attrs: { x: "72", y: "334" } },
      ],
    };
    const resolve = () => ({ index: 1, type: 9 });
    const bytes = encodeSlot(slot, resolve);
    expect(Array.from(bytes)).toEqual([
      0x01, 0x00, 0x01, 0x02,
      0x01, 0x00, 0x00, 0x09,
      0x48, 0x1c, 0x03, 0x00,
      0x48, 0x38, 0x05, 0x00,
    ]);
  });
});

describe("Widget 二进制编码", () => {
  it("写入 editBox 引用及组件标志位", () => {
    const resource: WatchfaceResource = {
      id: "widget",
      type: "Widget",
      attrs: {
        name: "Widget1", widgetName: "组件", groupType: "general", editBox: "@edit",
        preview: "@preview", jumpApp: "sport", w: "148", h: "148",
      },
      children: [{ id: "item", attrs: { ref: "@content", x: "0", y: "0" } }],
    };
    const references: Record<string, { index: number; type: number }> = {
      "@edit": { index: 1, type: 2 }, "@preview": { index: 2, type: 2 }, "@content": { index: 3, type: 2 },
    };
    const bytes = encodeWidget(resource, (value) => references[value!]!);

    expect(bytes).toHaveLength(60);
    expect(Array.from(bytes.subarray(36, 40))).toEqual([2, 0, 0, 2]);
    expect(Array.from(bytes.subarray(52, 56))).toEqual([1, 0, 0, 2]);
    expect(Array.from(bytes.subarray(42, 44))).toEqual([0xf7, 0x10]);
    expect(Array.from(bytes.subarray(56, 60))).toEqual([148, 0, 148, 0]);
  });
});

describe("数据资源通用编码", () => {
  it("写入图片数字的刷新周期及默认动态换色值", () => {
    const resource: WatchfaceResource = {
      id: "number",
      type: "DataItemImageNumber",
      attrs: {
        name: "ImageNumber1", source: "timeHour", ref: "@digits", totalDigits: "2", decimalDigits: "0", parameter: "250", supportRecolor: "false",
      },
      children: [],
    };
    const bytes = encodeDataResource(resource, () => ({ index: 0, type: 3 }), getDeviceDefinition("P65").dataSources);

    expect(Array.from(bytes.subarray(5, 8))).toEqual([0, 250, 0]);
  });

  it("从属性写入动态换色和 Pointer 动态范围", () => {
    const resource: WatchfaceResource = {
      id: "pointer",
      type: "DataItemPointer",
      attrs: {
        name: "Pointer1", source: "timeSecond", ref: "@pointer", supportRecolor: "true",
        valueStartSource: "timeHour", valueRangeSource: "timeMinute", pivotX: "0", pivotY: "0", angleStart: "0", angleRange: "360",
      },
      children: [],
    };
    const bytes = encodeDataResource(resource, () => ({ index: 0, type: 2 }), getDeviceDefinition("P65").dataSources);

    expect(bytes[5]).toBe(1);
    expect(bytes[14]).toBe(1);
    expect(bytes[18]).toBe(1);
  });

  it("写入系统文本的刷新周期和高度", () => {
    const resource: WatchfaceResource = {
      id: "text",
      type: "DataItemText",
      attrs: { name: "Text1", parameter: "250", w: "80", h: "31", string: "%d" },
      children: [{ id: "content", attrs: { source: "timeHour" } }],
    };
    const bytes = encodeDataResource(resource, () => ({ index: 0, type: 0 }), getDeviceDefinition("P65").dataSources);

    expect(Array.from(bytes.subarray(6, 8))).toEqual([250, 0]);
    expect(Array.from(bytes.subarray(22, 24))).toEqual([124, 0]);
  });
});
