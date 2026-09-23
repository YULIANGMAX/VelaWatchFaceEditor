import { describe, expect, it } from "vitest";
import { createBlankProject } from "../model";
import { compileWatchface, createCompileInput } from "./index";
import { getDeviceDefinition } from "../../device-definition";
import { inspectWatchfaceBin } from "./inspector";

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
));

describe("manifest.xml 独立打包器", () => {
  it("直接应用设备 JSON 中的头部字段和头部长度", async () => {
    const project = createBlankProject("O66");
    const standardDevice = structuredClone(getDeviceDefinition("O66"));
    const customDevice = structuredClone(standardDevice);
    customDevice.binary.header.size += 4;
    customDevice.binary.header.fixedFields.push({ offset: 7, encoding: "uint8", value: 0xab });

    const standard = await compileWatchface(createCompileInput(project), { device: standardDevice });
    const custom = await compileWatchface(createCompileInput(project), { device: customDevice });

    expect(custom.bytes[7]).toBe(0xab);
    expect(custom.size).toBe(standard.size + 4);
  });

  it("直接应用设备 JSON 中的数据源编码覆盖", async () => {
    const project = createBlankProject("O66");
    project.resources.push({
      id: "device-source",
      type: "DataItemText",
      attrs: { name: "DeviceSource", string: "%d" },
      children: [{ id: "content", attrs: { source: "timeHour" } }],
    });
    project.themes[0]!.layouts.push({ id: "layout", attrs: { ref: "@DeviceSource", x: "0", y: "0" } });
    const device = structuredClone(getDeviceDefinition("O66"));
    device.dataSources.codeOverrides.timeHour = "BEEF";

    const result = await compileWatchface(createCompileInput(project), { device });
    const descriptor = inspectWatchfaceBin(result.bytes, device).faces[0]!.tables[7]!.descriptors[0]!;

    expect(Array.from(result.bytes.subarray(descriptor.offset + descriptor.length - 2, descriptor.offset + descriptor.length)))
      .toEqual([0xbe, 0xef]);
  });

  it("设备身份不同但编译定义相同时输出完全相同", async () => {
    const project = createBlankProject("O66");
    const standardDevice = structuredClone(getDeviceDefinition("O66"));
    const renamedDevice = structuredClone(standardDevice);
    renamedDevice.deviceType = "TEST";
    renamedDevice.name = "测试设备";

    const standard = await compileWatchface(createCompileInput(project), { device: standardDevice });
    const renamed = await compileWatchface(createCompileInput(project), { device: renamedDevice });

    expect(renamed.bytes).toEqual(standard.bytes);
    expect(renamed.sha256).toBe(standard.sha256);
  });

  it("编译前按设备 JSON 拒绝不支持的资源和属性", async () => {
    const project = createBlankProject("O66");
    project.resources.push({
      id: "unsupported-resource",
      type: "DataItemText",
      attrs: { name: "Unsupported", string: "%d" },
      children: [{ id: "content", attrs: { source: "timeHour" } }],
    });
    const device = structuredClone(getDeviceDefinition("O66"));
    device.manifest.resourceTypes.exclude.push("DataItemText");

    await expect(compileWatchface(createCompileInput(project), { device }))
      .rejects.toThrow("不支持资源类型 DataItemText");

    device.manifest.resourceTypes.exclude = [];
    device.manifest.attributes.exclude.DataItemText = ["string"];
    await expect(compileWatchface(createCompileInput(project), { device }))
      .rejects.toThrow("不支持 DataItemText.string");
  });

  it("未知扩展、未验证属性值和设备尺寸不匹配均阻止编译", async () => {
    const device = getDeviceDefinition("P65");
    const project = createBlankProject("P65");
    project.themes[0]!.attrs.isPhotoAlbumWatchface = "true";
    await expect(compileWatchface(createCompileInput(project), { device }))
      .rejects.toThrow("尚未验证 Theme.isPhotoAlbumWatchface=true");

    project.themes[0]!.attrs.isPhotoAlbumWatchface = "false";
    project.watchface.width = "431";
    await expect(compileWatchface(createCompileInput(project), { device }))
      .rejects.toThrow("Watchface.width 必须等于设备宽度 432");

    project.watchface.width = "432";
    project.manifestExtensions.push({ id: "extension", parent: "Watchface", index: 0, xml: "<UnknownFuture/>" });
    await expect(compileWatchface(createCompileInput(project), { device }))
      .rejects.toThrow("1 个尚未支持的 XML 节点");
  });

  it("按项目版本和 P65 设备定义生成标准头字段与主题标志", async () => {
    const project = createBlankProject("P65");
    project.description.version = "1.0.25";
    project.themes.push({
      id: "aod",
      attrs: { type: "AOD", name: "息屏", bgColor: "#000000" },
      layouts: [],
    });
    const oneStyle = await compileWatchface(createCompileInput(project), { device: getDeviceDefinition("P65") });

    expect(oneStyle.bytes[0x04]).toBe(25);
    expect(oneStyle.bytes[0x0a]).toBe(0);
    expect(oneStyle.bytes[0x16]).toBe(1);
    expect(oneStyle.bytes[0x1e]).toBe(0x24);

    project.themes.push({
      id: "second-style",
      attrs: { type: "normal", name: "样式2", bgColor: "#000000" },
      layouts: [],
    });
    const multipleStyles = await compileWatchface(createCompileInput(project), { device: getDeviceDefinition("P65") });
    expect(multipleStyles.bytes[0x1e]).toBe(0x26);
  });

  it("每个 Theme 重置 Layout ID，并将 Widget.editBox 纳入可达资源", async () => {
    const project = createBlankProject("P65");
    project.resources.push(
      {
        id: "edit-box",
        type: "Image",
        attrs: { name: "EditBox", src: "edit-box.png", format: "RGBA32", compressMethod: "RLEReversed" },
        children: [],
      },
      {
        id: "widget",
        type: "Widget",
        attrs: { name: "Widget1", editBox: "@EditBox", w: "10", h: "10" },
        children: [],
      },
    );
    project.assets["edit-box.png"] = {
      path: "edit-box.png",
      blob: new Blob([ONE_PIXEL_PNG]),
      url: "",
    };
    project.themes[0]!.layouts.push({ id: "layout-1", attrs: { ref: "@Widget1", x: "0", y: "0" } });
    project.themes.push({
      id: "theme-2",
      attrs: { type: "normal", name: "样式2", bgColor: "#000000" },
      layouts: [{ id: "layout-2", attrs: { ref: "@Widget1", x: "1", y: "1" } }],
    });

    const result = await compileWatchface(createCompileInput(project), { device: getDeviceDefinition("P65") });
    const inspected = inspectWatchfaceBin(result.bytes, getDeviceDefinition("P65"));

    expect(inspected.faces.map((face) => face.tables[0]!.descriptors.map((descriptor) => descriptor.id)))
      .toEqual([[0], [0]]);
    expect(inspected.faces.map((face) => face.tables[2]!.descriptors.map((descriptor) => descriptor.id)))
      .toEqual([[0], [0]]);
  });
  it("静态表盘名称与多语言名称分别正确写入 0x68-0xA7 头部区域", async () => {
    const device = getDeviceDefinition("P65");

    // 1. 静态名称表盘
    const staticProject = createBlankProject("P65");
    staticProject.watchface.name = "测试表盘";
    const staticResult = await compileWatchface(createCompileInput(staticProject), { device });
    const staticNameSlice = staticResult.bytes.subarray(0x68, 0xa8);
    const zeroIndex = staticNameSlice.indexOf(0);
    const decodedName = new TextDecoder().decode(staticNameSlice.subarray(0, zeroIndex));
    expect(decodedName).toBe("测试表盘");
    expect(staticNameSlice.subarray(zeroIndex).every((b) => b === 0)).toBe(true);

    // 2. 多语言名称表盘 (@wfName)
    const i18nProject = createBlankProject("P65");
    i18nProject.watchface.name = "@wfName";
    i18nProject.resources.push({
      id: "wf-trans",
      type: "Translation",
      attrs: { name: "wfName" },
      children: [
        { id: "zh", attrs: { language: "zh_CN", str: "拼图" } },
        { id: "en", attrs: { language: "en_US", str: "Collage" } },
        { id: "tw", attrs: { language: "zh_TW", str: "拼圖" } },
      ],
    });
    const i18nResult = await compileWatchface(createCompileInput(i18nProject), { device });
    const view = new DataView(i18nResult.bytes.buffer, i18nResult.bytes.byteOffset);
    expect(view.getUint32(0x68, true)).toBe(0xffffffff);
    expect(i18nResult.bytes[0x6f]).toBe(6);
    expect(view.getUint32(0x70, true)).toBe(0);
    const offset = view.getUint32(0x74, true);
    expect(offset).toBeGreaterThan(0xa8);
    const length = view.getUint32(0x78, true);
    expect(length).toBe(39);
    const payloadBytes = i18nResult.bytes.subarray(offset, offset + length);
    expect(payloadBytes.length).toBe(39);
    const payloadText = new TextDecoder().decode(payloadBytes);
    expect(payloadText).toContain("Collage");
    expect(payloadText).toContain("拼图");
    expect(payloadText).toContain("拼圖");
  });
});

