import { describe, expect, it } from "vitest";
import {
  DEVICE_DEFINITIONS,
  DEVICE_PROFILES,
  findDeviceProfile,
  getDeviceProfile,
  isDataSourceSupported,
  supportsManifestAttribute,
  supportsManifestAttributeValue,
  supportsManifestResource,
} from ".";

const expectedDevices = [
  "L61", "M65", "M65A", "M66", "M67", "N62", "N62S", "N65",
  "N65A", "N65B", "N66", "N67", "O62", "O65", "O66", "P65",
];

describe("Vela 设备定义注册表", () => {
  it("自动发现逐设备 JSON，并精确限制为当前支持清单", () => {
    const files = import.meta.glob("./devices/*.json", { eager: true });
    const fileNames = Object.keys(files).map((path) => path.split("/").at(-1)!.replace(/\.json$/, "")).sort();
    const registered = DEVICE_DEFINITIONS.map((definition) => definition.deviceType).sort();

    expect(fileNames).toEqual(expectedDevices);
    expect(registered).toEqual(expectedDevices);
    expect(DEVICE_PROFILES).toHaveLength(expectedDevices.length);
    expect(DEVICE_DEFINITIONS.every((definition) => definition.system === "vela")).toBe(true);
    expect(findDeviceProfile("common")).toBeUndefined();
    expect(findDeviceProfile("K67")).toBeUndefined();
    expect(findDeviceProfile("O64")).toBeUndefined();
  });

  it("从设备文件读取显示、头部、编译和数据源能力", () => {
    expect(getDeviceProfile("O62")).toMatchObject({
      label: "Xiaomi Watch S4",
      width: 466,
      height: 466,
      radius: 233,
      binary: { header: { size: 168 } },
    });
    expect(getDeviceProfile("N62S").label).toBe("Xiaomi Watch S4 Sport");
    expect(getDeviceProfile("N66").dataSources.codeOverrides).toEqual({});
    expect(getDeviceProfile("O66").dataSources.codeOverrides).toEqual({});
    expect(getDeviceProfile("O66").dataSources.codes.timeHour).toBe("0811");
    expect(Object.keys(getDeviceProfile("O66").dataSources.codes)).toHaveLength(166);
    expect(isDataSourceSupported("O66", "timeHour")).toBe(true);
    expect(DEVICE_DEFINITIONS.every((definition) => definition.manifest.resourceTypes.policy === "all-format")).toBe(true);
  });

  it("设备定义可独立限制 manifest 资源类型和属性", () => {
    const device = structuredClone(DEVICE_DEFINITIONS.find((entry) => entry.deviceType === "O66")!);
    device.manifest.resourceTypes = {
      policy: "all-format",
      include: [],
      exclude: ["DataItemText"],
    };
    device.manifest.attributes.exclude = {
      Watchface: ["version"],
      Image: ["rotation"],
      "ImageArray/Image": ["src"],
    };

    expect(supportsManifestResource(device, "Image")).toBe(true);
    expect(supportsManifestResource(device, "DataItemText")).toBe(false);
    device.manifest.resourceTypes = { policy: "allow-list", include: ["Image"], exclude: [] };
    expect(supportsManifestResource(device, "Sprite")).toBe(false);
    expect(supportsManifestAttribute(device, "Watchface", "version")).toBe(false);
    expect(supportsManifestAttribute(device, "Image", "rotation")).toBe(false);
    expect(supportsManifestAttribute(device, "Image", "src")).toBe(true);
    expect(supportsManifestAttribute(device, "Image", "x")).toBe(false);
    expect(supportsManifestAttribute(device, "ImageArray/Image", "src")).toBe(false);
  });

  it("P65 只解锁已经验证的属性值", () => {
    const p65 = DEVICE_DEFINITIONS.find((entry) => entry.deviceType === "P65")!;
    const o66 = DEVICE_DEFINITIONS.find((entry) => entry.deviceType === "O66")!;

    expect(p65.manifest.attributes.policy).toBe("allow-list");
    expect(supportsManifestAttribute(p65, "Watchface", "editable")).toBe(true);
    expect(supportsManifestAttributeValue(p65, "Watchface", "editable", "true")).toBe(true);
    expect(supportsManifestAttributeValue(p65, "Theme", "isPhotoAlbumWatchface", "true")).toBe(false);
    expect(supportsManifestAttributeValue(p65, "DataItemImageNumber", "supportRecolor", "true")).toBe(false);
    expect(supportsManifestAttribute(o66, "Watchface", "editable")).toBe(false);
  });

  it("未知设备不会静默回退到 Common", () => {
    expect(() => getDeviceProfile("UNKNOWN")).toThrow("不支持设备 UNKNOWN");
  });
});
