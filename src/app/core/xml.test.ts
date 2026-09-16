import { describe, expect, it } from "vitest";
import { validateProject } from "./validation";
import { createBlankProject, DEVICE_PROFILES, generateWatchfaceId, getDeviceDefinition, getDeviceProfile } from "./model";
import { FORMAT_RESOURCE_DEFINITION_MAP as RESOURCE_DEFINITION_MAP } from "../format-definition/manifestFormat";
import {
  createAssetImportCandidates,
  createResourceFolder,
  deleteResourceFolder,
  hasProjectFiles,
  moveResourceFiles,
  moveResourceFolder,
  readResourceLibrary,
  renameResourceFolder,
  saveProjectDirectory,
  writeResourceAssets,
} from "./projectIO";
import { parseManifest, serializeManifest } from "./xml";

interface MemoryDirectory {
  directories: Map<string, MemoryDirectory>;
  files: Map<string, string | Blob>;
}

function memoryDirectoryHandle(node: MemoryDirectory): FileSystemDirectoryHandle {
  const fileHandle = (name: string): FileSystemFileHandle => ({
    kind: "file",
    name,
    async getFile() {
      const content = node.files.get(name);
      if (content === undefined) throw new DOMException("文件不存在", "NotFoundError");
      return content instanceof File ? content : new File([content], name);
    },
    async createWritable() {
      return {
        async write(content: FileSystemWriteChunkType) {
          if (typeof content !== "string" && !(content instanceof Blob)) {
            throw new Error("测试只接受字符串或 Blob 写入");
          }
          node.files.set(name, content);
        },
        async close() {},
      };
    },
  }) as FileSystemFileHandle;

  return {
    async *entries() {
      for (const [name, directory] of node.directories) {
        yield [name, Object.assign(memoryDirectoryHandle(directory), { kind: "directory", name })];
      }
      for (const name of node.files.keys()) {
        yield [name, fileHandle(name)];
      }
    },
    async removeEntry(name: string) {
      node.files.delete(name);
      node.directories.delete(name);
    },
    async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
      if (node.files.has(name)) throw new DOMException("类型不匹配", "TypeMismatchError");
      let directory = node.directories.get(name);
      if (!directory) {
        if (!options?.create) throw new DOMException("目录不存在", "NotFoundError");
        directory = { directories: new Map(), files: new Map() };
        node.directories.set(name, directory);
      }
      return memoryDirectoryHandle(directory);
    },
    async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
      if (node.directories.has(name)) throw new DOMException("类型不匹配", "TypeMismatchError");
      if (!node.files.has(name)) {
        if (!options?.create) throw new DOMException("文件不存在", "NotFoundError");
        node.files.set(name, new Blob());
      }
      return fileHandle(name);
    },
  } as FileSystemDirectoryHandle;
}

describe("Vela manifest.xml 已观测格式边界", () => {
  it("项目目录须同时包含 description.xml 与 resources/manifest.xml", async () => {
    const resources: MemoryDirectory = { directories: new Map(), files: new Map([["manifest.xml", "<Watchface />"]]) };
    const root: MemoryDirectory = { directories: new Map([["resources", resources]]), files: new Map() };
    const directory = memoryDirectoryHandle(root);

    await expect(hasProjectFiles(directory)).resolves.toBe(false);
    root.files.set("description.xml", "<description />");
    await expect(hasProjectFiles(directory)).resolves.toBe(true);
  });

  it("全部已声明资源类型均可按同一 schema 往返", () => {
    const project = createBlankProject();
    project.resources = Object.values(RESOURCE_DEFINITION_MAP).map((definition, index) => {
      const child = definition.child
        ? [{ id: `child-${index}`, attrs: Object.fromEntries(definition.child.fields.map((field) => [field.key, field.key === "src" ? "a.png" : field.key === "source" ? "timeHour" : field.key === "value" ? "0" : field.key === "language" ? "zh_CN" : field.key === "str" ? "文本" : field.key === "ref" ? "@Widget1" : "0"])) }]
        : [];
      return { id: `resource-${index}`, type: definition.type, attrs: { ...definition.defaults }, children: child };
    });

    const parsed = parseManifest(serializeManifest(project));
    expect(parsed.blocked).toBe(false);
    expect(parsed.project?.resources.map((resource) => resource.type)).toEqual(project.resources.map((resource) => resource.type));
  });

  it("将 DataItem supportRecolor 作为已知属性保留", () => {
    const result = parseManifest(`<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="123456789" name="边界测试">
  <Resources>
    <ImageArray name="digits" compressMethod="RLEReversed" format="RGBA32"><Image src="0.png"/></ImageArray>
    <DataItemImageNumber name="number" source="timeHour" ref="@digits" totalDigits="2" decimalDigits="0" supportRecolor="false"/>
  </Resources>
  <Theme type="normal"><Layout ref="@number" x="0" y="0"/></Theme>
</Watchface>`);

    expect(result.blocked).toBe(false);
    expect(result.project?.resources[1]?.attrs.supportRecolor).toBe("false");
    expect(serializeManifest(result.project!)).toContain('supportRecolor="false"');
  });

  it("将原帖笔误 param 无损保留但交由校验阻止编译", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="123456789" name="ParamTypo">
  <Resources>
    <DataItemText name="hour" source="timeHour" string="%d" param="1000"/>
  </Resources>
  <Theme type="normal" name="默认" bgColor="#000000"/>
</Watchface>`;
    const result = parseManifest(xml, "O66");

    expect(result.blocked).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code === "unsupported-attribute" && entry.message.includes("param"))).toBe(true);
    expect(result.project?.resources[0]?.attrs.param).toBe("1000");
    expect(serializeManifest(result.project!)).toContain('param="1000"');
    expect(validateProject(result.project!).some((entry) => entry.code === "unknown-manifest-attribute")).toBe(true);
  });

  it("未知属性和未知子节点保持原父节点及相对位置", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="123456789" name="扩展" futureRoot="keep">
  <Resources>
    <Image name="first" src="first.png" compressMethod="None" format="indexed8"/>
    <FutureResource mode="keep"><Child value="1"/></FutureResource>
    <Widget name="widget" w="10" h="10"><FutureItem value="2"/></Widget>
  </Resources>
  <Theme type="normal" name="默认" bgColor="#000000">
    <FutureLayout value="3"/>
  </Theme>
</Watchface>`;
    const parsed = parseManifest(xml, "P65");

    expect(parsed.blocked).toBe(false);
    expect(parsed.project?.watchface.futureRoot).toBe("keep");
    expect(parsed.project?.manifestExtensions).toHaveLength(3);
    const serialized = serializeManifest(parsed.project!);
    expect(serialized).toContain('futureRoot="keep"');
    expect(serialized.indexOf("<FutureResource")).toBeGreaterThan(serialized.indexOf('name="first"'));
    expect(serialized).toContain('<FutureItem value="2"/>');
    expect(serialized).toContain('<FutureLayout value="3"/>');
    expect(validateProject(parsed.project!).some((entry) => entry.code === "unknown-manifest-extension")).toBe(true);
  });

  it("DataItemText 可仅使用 Content，且新建图片数字默认不补前导零", () => {
    const project = createBlankProject();
    project.resources.push({
      id: "text",
      type: "DataItemText",
      attrs: { name: "text", style: "normal", w: "80", h: "30", fontSize: "20", string: "%d:%d" },
      children: [
        { id: "hour", attrs: { source: "timeHour" } },
        { id: "minute", attrs: { source: "timeMinute" } },
      ],
    });

    expect(validateProject(project).some((entry) => entry.code === "missing-text-source")).toBe(false);
    expect(RESOURCE_DEFINITION_MAP.DataItemImageNumber.defaults.leadingZero).toBe("false");
  });

  it("阻止非法枚举、裸引用、非 PNG 图片及不同尺寸序列", () => {
    const project = createBlankProject();
    project.assets["a.png"] = { path: "a.png", blob: new Blob(), url: "", width: 10, height: 10 };
    project.assets["b.png"] = { path: "b.png", blob: new Blob(), url: "", width: 20, height: 10 };
    project.resources.push({
      id: "array",
      type: "ImageArray",
      attrs: { name: "array", compressMethod: "unknown", format: "RGBA32" },
      children: [{ id: "a", attrs: { src: "a.png" } }, { id: "b", attrs: { src: "b.png" } }],
    });
    project.resources.push({
      id: "sprite",
      type: "Sprite",
      attrs: { name: "sprite", ref: "array", repeatCount: "0", interval: "80" },
      children: [],
    });
    project.resources.push({
      id: "image",
      type: "Image",
      attrs: { name: "image", src: "bad.jpg", compressMethod: "RLEReversed", format: "RGBA32" },
      children: [],
    });

    const codes = validateProject(project).map((entry) => entry.code);
    expect(codes).toContain("invalid-option");
    expect(codes).toContain("invalid-reference-syntax");
    expect(codes).toContain("invalid-image-extension");
    expect(codes).toContain("image-array-size-mismatch");
  });

  it("校验颜色组首项并阻止 Widget/Slot 循环引用", () => {
    const project = createBlankProject();
    project.watchface.colorGroupTable = "#ff0000,#00ff00";
    project.resources.push(
      { id: "green", type: "Image", attrs: { name: "same", src: "a.png", compressMethod: "RLEReversed", format: "RGBA32", colorGroup: "#00ff00" }, children: [] },
      { id: "blue", type: "Image", attrs: { name: "same", src: "a.png", compressMethod: "RLEReversed", format: "RGBA32", colorGroup: "#0000ff" }, children: [] },
      { id: "widget", type: "Widget", attrs: { name: "Widget1" }, children: [{ id: "slot-ref", attrs: { ref: "@Slot1" } }] },
      { id: "slot", type: "Slot", attrs: { name: "Slot1", type: "widget" }, children: [{ id: "widget-ref", attrs: { ref: "@Widget1" } }] },
    );

    const codes = validateProject(project).map((entry) => entry.code);
    expect(codes).toContain("unknown-color-group");
    expect(codes).toContain("missing-first-color-group");
    expect(codes).toContain("cyclic-composite-reference");
  });

  it("设备预设直接携带二进制定义", () => {
    expect(DEVICE_PROFILES).toHaveLength(16);
    expect(getDeviceProfile("O65")).toMatchObject({ id: "O65", label: "Redmi Watch 5", width: 432, height: 514, radius: 103 });
    expect(getDeviceProfile("P65")).toMatchObject({ id: "P65", label: "Redmi Watch 6", width: 432, height: 514, radius: 108 });
    expect(getDeviceDefinition("N66").binary.header.size).toBe(0xa8);
    expect(getDeviceDefinition("O66").binary.header.fixedFields[0]).toEqual({ offset: 0, encoding: "hex", value: "5AA53412" });
    expect(getDeviceProfile("N62S").label).toBe("Xiaomi Watch S4 Sport");
  });

  it("解析并序列化带 movable 和 Position 子节点的 Slot 资源", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="123456789012" name="测试" width="432" height="514">
    <Resources>
        <Widget name="Widget2" groupType="general"/>
        <Slot name="Slot1" type="widget" movable="true">
            <Item ref="@Widget2"/>
            <Position x="72" y="199"/>
            <Position x="72" y="334"/>
        </Slot>
    </Resources>
    <Theme type="normal" name="默认" bgColor="#000000">
        <Layout ref="@Slot1" x="72" y="199"/>
    </Theme>
</Watchface>`;
    const parsed = parseManifest(xml);
    expect(parsed.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(parsed.project).not.toBeNull();
    const slot = parsed.project!.resources.find((r) => r.type === "Slot");
    expect(slot).toBeDefined();
    expect(slot?.attrs.movable).toBe("true");
    expect(slot?.attrs.type).toBe("widget");
    expect(slot?.children).toHaveLength(3);
    expect(slot?.children[0]?.tag).toBe("Item");
    expect(slot?.children[0]?.attrs.ref).toBe("@Widget2");
    expect(slot?.children[1]?.tag).toBe("Position");
    expect(slot?.children[1]?.attrs.x).toBe("72");
    expect(slot?.children[1]?.attrs.y).toBe("199");
    expect(slot?.children[2]?.tag).toBe("Position");
    expect(slot?.children[2]?.attrs.x).toBe("72");
    expect(slot?.children[2]?.attrs.y).toBe("334");

    const serialized = serializeManifest(parsed.project!);
    expect(serialized).toContain('<Slot name="Slot1" type="widget" movable="true">');
    expect(serialized).toContain('<Item ref="@Widget2"/>');
    expect(serialized).toContain('<Position x="72" y="199"/>');
    expect(serialized).toContain('<Position x="72" y="334"/>');
  });

  it("生成合法的 12 位表盘 ID", () => {
    expect(generateWatchfaceId()).toMatch(/^\d{12}$/);
  });

  it("保存仅写入 XML，不触碰资源文件与目录", async () => {
    const resources: MemoryDirectory = {
      directories: new Map([["stale-folder", {
        directories: new Map(),
        files: new Map([["old.png", new Blob(["old"])]]),
      }]]),
      files: new Map([["stale.png", new Blob(["stale"])]]),
    };
    const root: MemoryDirectory = {
      directories: new Map([["resources", resources]]),
      files: new Map(),
    };
    const project = createBlankProject("O66");
    project.assetFolders = ["empty/nested"];
    project.assets["images/test.png"] = {
      path: "images/test.png",
      blob: new Blob(["png"]),
      url: "",
    };

    await saveProjectDirectory(memoryDirectoryHandle(root), project);

    const savedResources = root.directories.get("resources");
    expect(root.directories.has("preview")).toBe(false);
    expect(savedResources?.files.get("manifest.xml")).toContain("<Watchface");
    expect(savedResources?.directories.has("images")).toBe(false);
    expect(savedResources?.directories.has("empty")).toBe(false);
    expect(savedResources?.files.has("stale.png")).toBe(true);
    expect(savedResources?.directories.has("stale-folder")).toBe(true);
    expect(root.files.get("description.xml")).toContain("<watch>");
    expect(root.files.has("resource.bin")).toBe(false);
  });

  it("导入文件写入所选资源文件夹且不转换为 manifest 资源", () => {
    const file = new File(["png"], "0.png", { type: "image/png", lastModified: 123456 });

    const candidates = createAssetImportCandidates([file], "digits/hour");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourcePath).toBe("0.png");
    expect(candidates[0].asset).toMatchObject({ path: "digits/hour/0.png", lastModified: 123456 });
  });

  it("重新扫描 resources 后反映系统中的文件移动", async () => {
    const source: MemoryDirectory = { directories: new Map(), files: new Map([["sun.png", new File(["sun"], "sun.png", { lastModified: 123 })]]) };
    const target: MemoryDirectory = { directories: new Map(), files: new Map() };
    const resources: MemoryDirectory = { directories: new Map([["icons", source], ["weather", target]]), files: new Map() };
    const root: MemoryDirectory = { directories: new Map([["resources", resources]]), files: new Map() };
    const handle = memoryDirectoryHandle(root);

    const before = await readResourceLibrary(handle);
    expect(Object.keys(before.assets)).toEqual(["icons/sun.png"]);

    target.files.set("sun.png", source.files.get("sun.png")!);
    source.files.delete("sun.png");
    const after = await readResourceLibrary(handle, before.assets);

    expect(Object.keys(after.assets)).toEqual(["weather/sun.png"]);
    expect(after.folders).toEqual(["icons", "weather"]);
  });

  it("资源管理操作立即写入 resources 目录", async () => {
    const root: MemoryDirectory = { directories: new Map(), files: new Map() };
    const handle = memoryDirectoryHandle(root);

    await createResourceFolder(handle, "icons/weather");
    expect(root.directories.get("resources")?.directories.get("icons")?.directories.has("weather")).toBe(true);

    const writeProgress: Array<{ completedFiles: number; writtenBytes: number }> = [];
    await writeResourceAssets(handle, [
      {
        path: "icons/sun.png",
        blob: new Blob(["sun"], { type: "image/png" }),
        url: "",
      },
      {
        path: "icons/moon.png",
        blob: new Blob(["moon"], { type: "image/png" }),
        url: "",
      },
    ], ({ completedFiles, writtenBytes }) => writeProgress.push({ completedFiles, writtenBytes }));
    expect(root.directories.get("resources")?.directories.get("icons")?.files.has("sun.png")).toBe(true);
    expect(root.directories.get("resources")?.directories.get("icons")?.files.has("moon.png")).toBe(true);
    expect(writeProgress.at(-1)).toEqual({ completedFiles: 2, writtenBytes: 7 });

    const moveProgress: Array<{ completedFiles: number; writtenBytes: number }> = [];
    expect((await moveResourceFiles(
      handle,
      ["icons/sun.png", "icons/moon.png"],
      "icons/weather",
      ({ completedFiles, writtenBytes }) => moveProgress.push({ completedFiles, writtenBytes }),
    )).status).toBe("moved");
    expect(root.directories.get("resources")?.directories.get("icons")?.files.has("sun.png")).toBe(false);
    expect(root.directories.get("resources")?.directories.get("icons")?.files.has("moon.png")).toBe(false);
    expect(root.directories.get("resources")?.directories.get("icons")?.directories.get("weather")?.files.has("sun.png")).toBe(true);
    expect(root.directories.get("resources")?.directories.get("icons")?.directories.get("weather")?.files.has("moon.png")).toBe(true);
    expect(moveProgress.at(-1)).toEqual({ completedFiles: 2, writtenBytes: 7 });

    expect(await renameResourceFolder(handle, "icons/weather", "climate")).toBe("moved");
    expect(root.directories.get("resources")?.directories.get("icons")?.directories.has("weather")).toBe(false);
    expect(root.directories.get("resources")?.directories.get("icons")?.directories.has("climate")).toBe(true);
    expect(await moveResourceFolder(handle, "icons/climate", "")).toBe("moved");
    expect(root.directories.get("resources")?.directories.has("climate")).toBe(true);
    await deleteResourceFolder(handle, "climate");
    expect(root.directories.get("resources")?.directories.has("climate")).toBe(false);
  });
});
