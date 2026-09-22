import { createId, normalizePath, refName, type Diagnostic, type WatchfaceProject, type WatchfaceResource } from "../model";
import { getWidgetEffectiveSize } from "../measure";
import { supportsManifestAttribute, supportsManifestAttributeValue, supportsManifestResource } from "../../device-definition";
import { FORMAT_RESOURCE_DEFINITION_MAP, FORMAT_STRUCTURE } from "../../format-definition/manifestFormat";
import { writeUint16, writeUint24, writeUint32 } from "./binary";
import { decodePng, type DecodedPng } from "./png";
import { readBlobBytes } from "./blob";
import { encodeImageArrayResource, encodeImageBlock, encodeSingleImageResource, type CompressionMethod, type EncodedImageBlock, type ImageFormat } from "./image";
import { encodeDataResource, encodeSlot, encodeSprite, encodeTranslation, encodeWidget } from "./resources";
import {
  DESCRIPTOR_SIZE,
  ELEMENT_TYPE_COUNT,
  FACE_HEADER_SIZE,
  FACE_RECORD_SIZE,
  THEME_NAME_SIZE,
} from "./inspector";
import {
  WatchfaceCompileError,
  type CompileInput,
  type CompileOptions,
  type CompileResult,
  type ProgressListener,
} from "./types";

interface IndexedResource {
  resource: WatchfaceResource;
  type: number;
  index: number;
  variantIndex?: number;
  colorGroupIndex?: number;
  payloadKey: string;
}

interface Payload {
  key: string;
  bytes: Uint8Array;
  offset: number;
}

interface DescriptorPlan {
  id: number;
  type: number;
  flags?: number;
  payloadKey: string;
}

interface FacePlan {
  name: string;
  aod: boolean;
  bgColor: string;
  previewKey?: string;
  previewIndex?: number;
  descriptors: DescriptorPlan[][];
}

function applyDeviceHeader(output: Uint8Array, options: CompileOptions): void {
  for (const field of options.device.binary.header.fixedFields) {
    if (field.encoding === "hex") {
      const bytes = Uint8Array.from({ length: field.value.length / 2 }, (_, index) =>
        Number.parseInt(field.value.slice(index * 2, index * 2 + 2), 16));
      output.set(bytes, field.offset);
    } else if (field.encoding === "uint8") {
      output[field.offset] = field.value;
    } else if (field.encoding === "uint16le") {
      writeUint16(output, field.offset, field.value);
    } else {
      writeUint32(output, field.offset, field.value);
    }
  }
}

const TYPE_BY_RESOURCE: Readonly<Record<WatchfaceResource["type"], number>> = {
  Image: 2,
  ImageArray: 3,
  Sprite: 4,
  File: 5,
  Translation: 6,
  DataItemText: 7,
  DataItemImageNumber: 7,
  DataItemImageValues: 7,
  DataItemPointer: 7,
  DataItemArcProgressBar: 7,
  DataItemLineProgressBar: 7,
  Slot: 8,
  Widget: 9,
};

function diagnostic(code: string, message: string, location: string): Diagnostic {
  return { id: createId("compile"), severity: "error", code, message, location };
}

function compileFailure(error: unknown, location = "编译"): WatchfaceCompileError {
  if (error instanceof WatchfaceCompileError) return error;
  const message = error instanceof Error ? error.message : "表盘编译失败";
  return new WatchfaceCompileError(message, [diagnostic("compile-error", message, location)]);
}

function numeric(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`数值无效：${value}`);
  return parsed;
}

function imageFormat(resource: WatchfaceResource): ImageFormat {
  const format = resource.attrs.format ?? "RGBA32";
  if (format !== "RGBA32" && format !== "RGB565A8" && format !== "indexed8") throw new Error(`未知图片格式 ${format}`);
  return format;
}

function compressionMethod(resource: WatchfaceResource): CompressionMethod {
  const method = resource.attrs.compressMethod ?? "RLEReversed";
  if (method !== "RLEReversed" && method !== "None") throw new Error(`未知压缩方式 ${method}`);
  return method;
}

function parseColorTable(value: string | undefined, attribute: string): Uint8Array {
  if (!value?.trim()) return new Uint8Array();
  const colors = value.split(",").map((color) => color.trim());
  const bytes = new Uint8Array(colors.length * 4);
  colors.forEach((color) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${attribute} 包含无效颜色：${color}`);
  });
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index]!;
    bytes[index * 4] = Number.parseInt(color.slice(5, 7), 16);
    bytes[index * 4 + 1] = Number.parseInt(color.slice(3, 5), 16);
    bytes[index * 4 + 2] = Number.parseInt(color.slice(1, 3), 16);
    bytes[index * 4 + 3] = 0;
  }
  return bytes;
}

function buildInput(project: WatchfaceProject): CompileInput {
  return {
    projectVersion: project.description.version ?? "",
    watchface: { ...project.watchface },
    resources: project.resources.map((resource) => ({
      ...resource,
      attrs: { ...resource.attrs },
      children: resource.children.map((child) => ({ ...child, attrs: { ...child.attrs } })),
    })),
    themes: project.themes.map((theme) => ({
      ...theme,
      attrs: { ...theme.attrs },
      layouts: theme.layouts.map((layout) => ({ ...layout, attrs: { ...layout.attrs } })),
    })),
    manifestExtensions: project.manifestExtensions.map((extension) => ({ ...extension })),
    assets: Object.fromEntries(Object.entries(project.assets).map(([path, asset]) => [normalizePath(path), asset.blob])),
    assetDimensions: Object.fromEntries(Object.entries(project.assets).map(([path, asset]) => [normalizePath(path), { width: asset.width, height: asset.height }])),
  };
}

export function createCompileInput(project: WatchfaceProject): CompileInput {
  return buildInput(project);
}

function indexResources(
  resources: WatchfaceResource[],
  colorGroupTable?: string,
): { indexed: IndexedResource[]; byName: Map<string, IndexedResource>; allByName: Map<string, IndexedResource[]> } {
  const colorGroups = (colorGroupTable ?? "")
    .split(",")
    .map((color) => color.trim().toLowerCase())
    .filter(Boolean);

  const nextIndex = new Map<number, number>();
  const nameIndexMap = new Map<string, number>();
  const variantCounter = new Map<string, number>();
  const allByName = new Map<string, IndexedResource[]>();

  const indexed: IndexedResource[] = resources.map((resource) => {
    const type = TYPE_BY_RESOURCE[resource.type];
    const name = resource.attrs.name;
    const colorGroup = resource.attrs.colorGroup?.trim().toLowerCase();
    const hasColorGroup = Boolean(colorGroup && colorGroups.includes(colorGroup));

    let index: number;
    let variantIndex: number | undefined;
    let colorGroupIndex: number | undefined;

    if (name && hasColorGroup) {
      const key = `${type}:${name}`;
      if (nameIndexMap.has(key)) {
        index = nameIndexMap.get(key)!;
        variantIndex = variantCounter.get(key)!;
        variantCounter.set(key, variantIndex + 1);
      } else {
        index = nextIndex.get(type) ?? 0;
        nextIndex.set(type, index + 1);
        nameIndexMap.set(key, index);
        variantIndex = 0;
        variantCounter.set(key, 1);
      }
      colorGroupIndex = colorGroups.indexOf(colorGroup!);
    } else {
      index = nextIndex.get(type) ?? 0;
      nextIndex.set(type, index + 1);
    }

    const payloadKey = variantIndex !== undefined
      ? `resource:${type}:${index}:var:${variantIndex}`
      : `resource:${type}:${index}`;

    const entry: IndexedResource = {
      resource,
      type,
      index,
      variantIndex,
      colorGroupIndex,
      payloadKey,
    };

    if (name) {
      const list = allByName.get(name) ?? [];
      list.push(entry);
      allByName.set(name, list);
    }

    return entry;
  });

  const byName = new Map<string, IndexedResource>();
  for (const entry of indexed) {
    const name = entry.resource.attrs.name;
    if (name && !byName.has(name)) byName.set(name, entry);
  }

  return { indexed, byName, allByName };
}

function resourceReferences(resource: WatchfaceResource): string[] {
  const references: string[] = [];
  for (const value of Object.values(resource.attrs)) {
    if (value.startsWith("@")) references.push(refName(value));
  }
  for (const child of resource.children) {
    for (const value of Object.values(child.attrs)) if (value.startsWith("@")) references.push(refName(value));
  }
  return references;
}

function reachableResources(
  roots: string[],
  byName: Map<string, IndexedResource>,
  allByName: Map<string, IndexedResource[]>,
): IndexedResource[] {
  const result = new Set<IndexedResource>();
  const visit = (name: string): void => {
    const entries = allByName.get(name);
    if (!entries || entries.length === 0) throw new Error(`引用了不存在的资源 @${name}`);
    for (const entry of entries) {
      if (result.has(entry)) continue;
      result.add(entry);
      for (const reference of resourceReferences(entry.resource)) visit(reference);
    }
  };
  for (const root of roots) visit(root);
  return [...result];
}

function resourceKey(type: number, index: number): string {
  return `resource:${type}:${index}`;
}

function layoutKey(face: number, index: number): string {
  return `layout:${face}:${index}`;
}

function previewKey(faceIndex: number): string {
  return `preview:${faceIndex}`;
}

function encodeFileResource(resource: WatchfaceResource, content: Uint8Array): Uint8Array {
  const filename = new TextEncoder().encode(resource.attrs.filename ?? "");
  if (filename.length > 255) throw new Error(`File filename 超过 255 字节：${resource.attrs.filename}`);
  if (content.length > 0xff_ffff) throw new Error(`File 内容超过 16 MiB：${resource.attrs.filename}`);
  const result = new Uint8Array(20 + filename.length + content.length);
  writeUint24(result, 0, content.length);
  result[3] = filename.length;
  result.set(filename, 20);
  result.set(content, 20 + filename.length);
  return result;
}

function encodeLayout(target: IndexedResource, x: number, y: number): Uint8Array {
  const result = new Uint8Array(16);
  writeUint24(result, 0, target.index);
  result[3] = target.type;
  writeUint16(result, 4, x);
  writeUint16(result, 6, y);
  return result;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.slice().buffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function encodeBackgroundColor(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`无效 bgColor：${value}`);
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return (0x8000_0000 | (red << 16) | (green << 8) | blue) >>> 0;
}

function projectVersionByte(version: string): number {
  const segments = version.trim().split(".");
  const patch = segments.at(-1) ?? "";
  if (!/^\d+$/.test(patch)) throw new Error(`项目版本号无效：${version}`);
  const value = Number(patch);
  if (value > 0xff) throw new Error(`项目版本号末段超过 255：${version}`);
  return value;
}

function assertDeviceCapabilities(input: CompileInput, options: CompileOptions): void {
  const device = options.device;
  if (input.manifestExtensions.length > 0) {
    throw new Error(`manifest.xml 包含 ${input.manifestExtensions.length} 个尚未支持的 XML 节点，不能编译`);
  }
  const assertAttributes = (attrs: Record<string, string>, target: string, known: ReadonlySet<string>): void => {
    for (const [attribute, value] of Object.entries(attrs)) {
      if (!known.has(attribute)) throw new Error(`${target}.${attribute} 尚未进入 manifest.xml 格式规范`);
      if (!supportsManifestAttribute(device, target, attribute)) throw new Error(`设备 ${device.deviceType} 不支持 ${target}.${attribute}`);
      if (!supportsManifestAttributeValue(device, target, attribute, value)) {
        throw new Error(`设备 ${device.deviceType} 尚未验证 ${target}.${attribute}=${value} 的二进制编码`);
      }
    }
  };
  if (input.watchface.width && Number(input.watchface.width) !== device.display.width) {
    throw new Error(`Watchface.width 必须等于设备宽度 ${device.display.width}`);
  }
  if (input.watchface.height && Number(input.watchface.height) !== device.display.height) {
    throw new Error(`Watchface.height 必须等于设备高度 ${device.display.height}`);
  }
  assertAttributes(input.watchface, "Watchface", new Set(FORMAT_STRUCTURE.root.fields.map((field) => field.key)));
  for (const resource of input.resources) {
    if (!supportsManifestResource(device, resource.type)) throw new Error(`设备 ${device.deviceType} 不支持资源类型 ${resource.type}`);
    const definition = FORMAT_RESOURCE_DEFINITION_MAP[resource.type];
    assertAttributes(resource.attrs, resource.type, new Set(definition.fields.map((field) => field.key)));
    const childTag = definition.child?.tag;
    for (const child of resource.children) {
      const target = `${resource.type}/${childTag ?? "?"}`;
      assertAttributes(child.attrs, target, new Set(definition.child?.fields.map((field) => field.key) ?? []));
    }
  }
  for (const theme of input.themes) {
    assertAttributes(theme.attrs, "Theme", new Set(FORMAT_STRUCTURE.theme.fields.map((field) => field.key)));
    for (const layout of theme.layouts) {
      assertAttributes(layout.attrs, "Layout", new Set(FORMAT_STRUCTURE.theme.child.fields.map((field) => field.key)));
    }
  }
}

export async function compileWatchface(
  input: CompileInput,
  options: CompileOptions,
  onProgress?: ProgressListener,
): Promise<CompileResult> {
  try {
    if (options.device.system !== "vela") throw new Error(`设备 ${options.device.deviceType} 不是 Vela 设备`);
    assertDeviceCapabilities(input, options);
    onProgress?.({ stage: "prepare", completed: 0, total: 1 });
    const { indexed, byName, allByName } = indexResources(input.resources, input.watchface.colorGroupTable);
    const resolveReference = (value: string | undefined, expectedType?: number): { index: number; type: number } => {
      const entry = byName.get(refName(value));
      if (!entry) throw new Error(`引用了不存在的资源 ${value ?? ""}`);
      if (expectedType !== undefined && entry.type !== expectedType) {
        throw new Error(`${value} 必须引用 type ${expectedType}，实际为 type ${entry.type}`);
      }
      return { index: entry.index, type: entry.type };
    };
    const imageEntries = indexed.filter((entry) => entry.type === 2 || entry.type === 3);
    const recolorTable = parseColorTable(input.watchface.recolorTable, "recolorTable");
    const colorGroupTable = parseColorTable(input.watchface.colorGroupTable, "colorGroupTable");
    if (recolorTable.length && colorGroupTable.length) throw new Error("recolorTable 与 colorGroupTable 不能同时使用");
    const colorTable = recolorTable.length ? recolorTable : colorGroupTable;
    const recolorCount = input.watchface.recolorTable?.split(",").length ?? 0;
    const colorGroupCount = input.watchface.colorGroupTable?.split(",").length ?? 0;
    const encodedResources = new Map<string, Uint8Array>();
    const decodedImages = new Map<string, DecodedPng>();
    const encodedImages = new Map<string, EncodedImageBlock>();
    let decodedCount = 0;
    const imageFileCount = imageEntries.reduce((sum, entry) => sum + (entry.type === 2 ? 1 : entry.resource.children.length), 0);
    onProgress?.({ stage: "decode-images", completed: 0, total: imageFileCount });

    const decodeAsset = async (path: string): Promise<DecodedPng> => {
      const normalized = normalizePath(path);
      const existing = decodedImages.get(normalized);
      if (existing) return existing;
      const blob = input.assets[normalized];
      if (!blob) throw new Error(`找不到图片文件 ${path}`);
      const image = await decodePng(blob, path);
      decodedImages.set(normalized, image);
      decodedCount += 1;
      onProgress?.({ stage: "decode-images", completed: decodedCount, total: imageFileCount });
      return image;
    };
    const encodeAsset = async (path: string, format: ImageFormat, compression: CompressionMethod): Promise<EncodedImageBlock> => {
      const dithering = options.device.binary.resourceEncoding.indexed8Dithering;
      const key = `${normalizePath(path)}\u0000${format}\u0000${compression}\u0000${dithering}`;
      const existing = encodedImages.get(key);
      if (existing) return existing;
      const encoded = encodeImageBlock(await decodeAsset(path), format, compression, dithering);
      encodedImages.set(key, encoded);
      return encoded;
    };

    for (const entry of imageEntries) {
      const resource = entry.resource;
      const format = imageFormat(resource);
      const compression = compressionMethod(resource);
      const recolor = resource.attrs.recolorEnable === "true";
      if (entry.type === 2) {
        const image = await decodeAsset(resource.attrs.src);
        encodedResources.set(entry.payloadKey, encodeSingleImageResource(image, await encodeAsset(resource.attrs.src, format, compression), recolor));
      } else {
        const images = await Promise.all(resource.children.map((child) => decodeAsset(child.attrs.src)));
        const blocks = await Promise.all(resource.children.map((child) => encodeAsset(child.attrs.src, format, compression)));
        encodedResources.set(
          entry.payloadKey,
          encodeImageArrayResource(images, blocks, recolor),
        );
      }
    }

    onProgress?.({ stage: "encode-resources", completed: imageEntries.length, total: input.resources.length });
    let encodedCount = imageEntries.length;
    for (const entry of indexed.filter((candidate) => candidate.type !== 2 && candidate.type !== 3)) {
      const resource = entry.resource;
      let bytes: Uint8Array;
      switch (resource.type) {
        case "Sprite": bytes = encodeSprite(resource, resolveReference); break;
        case "File": {
          const blob = input.assets[normalizePath(resource.attrs.filename)];
          if (!blob) throw new Error(`找不到附加文件 ${resource.attrs.filename}`);
          bytes = encodeFileResource(resource, await readBlobBytes(blob));
          break;
        }
        case "Translation": bytes = encodeTranslation(resource); break;
        case "DataItemText":
        case "DataItemImageNumber":
        case "DataItemImageValues":
        case "DataItemPointer":
        case "DataItemArcProgressBar":
        case "DataItemLineProgressBar": bytes = encodeDataResource(
          resource, resolveReference, options.device.dataSources, options.device.binary.resourceEncoding,
        ); break;
        case "Slot": bytes = encodeSlot(resource, resolveReference); break;
        case "Widget": {
          const effectiveSize = getWidgetEffectiveSize({ resources: input.resources, assets: input.assetDimensions }, resource);
          bytes = encodeWidget(resource, resolveReference, effectiveSize);
          break;
        }
        default: throw new Error(`尚未实现 ${resource.type} 的二进制编码`);
      }
      encodedResources.set(entry.payloadKey, bytes);
      encodedCount += 1;
      onProgress?.({ stage: "encode-resources", completed: encodedCount, total: input.resources.length });
    }

    const payloads: Payload[] = [];
    const payloadByKey = new Map<string, Payload>();
    const addPayload = (key: string, bytes: Uint8Array): void => {
      if (payloadByKey.has(key)) return;
      const payload = { key, bytes, offset: 0 };
      payloads.push(payload);
      payloadByKey.set(key, payload);
    };

    const faces: FacePlan[] = input.themes.map((theme, faceIndex) => {
      let nextLayoutIndex = 0;
      const descriptors = Array.from({ length: ELEMENT_TYPE_COUNT }, () => [] as DescriptorPlan[]);
      theme.layouts.forEach((layout, layoutIndex) => {
        const target = byName.get(refName(layout.attrs.ref));
        if (!target) throw new Error(`Layout 引用了不存在的资源 ${layout.attrs.ref}`);
        const key = layoutKey(faceIndex, layoutIndex);
        addPayload(key, encodeLayout(target, numeric(layout.attrs.x), numeric(layout.attrs.y)));
        descriptors[0].push({ id: nextLayoutIndex, type: 0, payloadKey: key });
        nextLayoutIndex += 1;
      });
      const reachable = reachableResources(
        theme.layouts.map((layout) => refName(layout.attrs.ref)), byName, allByName,
      );
      for (const entry of reachable) {
        const key = entry.payloadKey;
        const encoded = encodedResources.get(key);
        if (!encoded) throw new Error(`尚未实现可达资源 ${entry.resource.attrs.name}（${entry.resource.type}）`);
        addPayload(key, encoded);
        const flags = entry.colorGroupIndex !== undefined ? (entry.colorGroupIndex << 3) : 0;
        descriptors[entry.type].push({ id: entry.index, type: entry.type, flags, payloadKey: key });
        if (entry.type === 5) {
          const duplicateKey = `${key}:face:${faceIndex}:args`;
          addPayload(duplicateKey, encoded.slice());
          descriptors[entry.type].push({ id: entry.index, type: entry.type, flags, payloadKey: duplicateKey });
        }
      }
      for (const table of descriptors) table.sort((left, right) => left.id - right.id || (left.flags ?? 0) - (right.flags ?? 0));
      const preview = theme.attrs.preview ? byName.get(refName(theme.attrs.preview)) : undefined;
      if (preview && preview.type !== 2) throw new Error(`Theme preview 必须引用 Image：${theme.attrs.preview}`);
      return {
        name: theme.attrs.name ?? "",
        aod: theme.attrs.type === "AOD",
        bgColor: theme.attrs.bgColor ?? "#000000",
        previewKey: preview ? previewKey(faceIndex) : undefined,
        previewIndex: preview?.index,
        descriptors,
      };
    });

    if (input.watchface.name?.startsWith("@")) {
      const translatedName = byName.get(refName(input.watchface.name));
      if (!translatedName || translatedName.type !== 6) throw new Error("Watchface.name 必须引用 Translation");
      const key = translatedName.payloadKey;
      const bytes = encodedResources.get(key);
      if (!bytes) throw new Error("找不到表盘名称 Translation 编码");
      addPayload(key, bytes);
    }

    for (const face of faces) {
      if (!face.previewKey || face.previewIndex === undefined) continue;
      const previewEntry = indexed.find((entry) => entry.type === 2 && entry.index === face.previewIndex);
      const bytes = previewEntry ? encodedResources.get(previewEntry.payloadKey) : undefined;
      if (!bytes) throw new Error("找不到 Theme 预览图编码");
      addPayload(face.previewKey, bytes);
    }

    const orderedPayloads: Payload[] = [];
    const appendPayload = (key: string): void => {
      const payload = payloadByKey.get(key);
      if (payload && !orderedPayloads.includes(payload)) orderedPayloads.push(payload);
    };
    // 连续写入全部 Layout，再按 manifest 中的资源顺序写入可达资源；
    // 预览图在其 Image 的全局位置写入，即使它不出现在描述符表中。
    faces.forEach((face) => {
      face.descriptors[0].forEach((descriptor) => appendPayload(descriptor.payloadKey));
    });
    for (const entry of indexed) {
      appendPayload(entry.payloadKey);
      faces.forEach((face) => {
        if (entry.type === 2 && face.previewIndex === entry.index && face.previewKey) appendPayload(face.previewKey);
      });
      faces.forEach((face, faceIndex) => {
        face.descriptors[entry.type]
          .filter((descriptor) => descriptor.id === entry.index && descriptor.payloadKey.includes(`:face:${faceIndex}:args`))
          .forEach((descriptor) => appendPayload(descriptor.payloadKey));
      });
    }

    const globalHeaderSize = options.device.binary.header.size;
    const faceStart = globalHeaderSize + colorTable.length;
    const faceRecordsLength = faces.length * FACE_RECORD_SIZE;
    const descriptorStart = faceStart + faceRecordsLength;
    const descriptorCount = faces.reduce((sum, face) => sum + face.descriptors.reduce((faceSum, table) => faceSum + table.length, 0), 0);
    let payloadOffset = descriptorStart + descriptorCount * DESCRIPTOR_SIZE;
    for (const payload of orderedPayloads) {
      payloadOffset = (payloadOffset + 3) & ~3;
      payload.offset = payloadOffset;
      payloadOffset += payload.bytes.length;
    }
    payloadOffset = (payloadOffset + 3) & ~3;

    onProgress?.({ stage: "assemble", completed: 0, total: 1 });
    const output = new Uint8Array(payloadOffset);
    applyDeviceHeader(output, options);
    output[0x04] = projectVersionByte(input.projectVersion);
    const totalColors = recolorCount || colorGroupCount;
    writeUint32(output, 0x18, 0);
    output[0x1c] = faces.length;
    output[0x1d] = totalColors;
    const normalThemeCount = input.themes.filter((theme) => theme.attrs.type !== "AOD").length;
    const hasColors = totalColors > 0;
    const isEditable = input.watchface.editable === "true"
      || input.watchface.editable === true
      || hasColors
      || indexed.some((entry) => entry.type === 8)
      || normalThemeCount > 1;
    const hasAod = faces.some((face) => face.aod);
    const combinationFlags = options.device.binary.header.combinationFlagsBase
      | (hasColors ? 1 : 0)
      | (isEditable ? 2 : 0)
      | (hasAod ? 4 : 0);
    writeUint16(output, 0x1e, combinationFlags);
    const firstPreview = faces.find((face) => face.previewKey)?.previewKey;
    if (firstPreview) writeUint32(output, 0x20, payloadByKey.get(firstPreview)!.offset);
    output.set(new TextEncoder().encode(input.watchface.id ?? "").subarray(0, 0x40), 0x28);
    // 0x68 ~ 0xA7 (64 字节) 为表盘名称联合体：静态 UTF-8 字符串，或多语言 Translation 指针
    if (input.watchface.name?.startsWith("@")) {
      const translatedName = resolveReference(input.watchface.name, 6);
      const translatedEntry = indexed.find((entry) => entry.type === 6 && entry.index === translatedName.index);
      const namePayload = translatedEntry ? payloadByKey.get(translatedEntry.payloadKey) : undefined;
      output.fill(0xff, 0x68, 0x6c);
      writeUint24(output, 0x6c, translatedName.index);
      output[0x6f] = 6;
      writeUint32(output, 0x70, 0);
      if (namePayload) {
        writeUint32(output, 0x74, namePayload.offset);
        writeUint32(output, 0x78, namePayload.bytes.length);
      } else {
        writeUint32(output, 0x74, 0);
        writeUint32(output, 0x78, 0);
      }
    } else {
      output.fill(0, 0x68, 0xa8);
      output.set(new TextEncoder().encode(input.watchface.name ?? "").subarray(0, 0x40), 0x68);
    }
    output.set(colorTable, globalHeaderSize);

    let descriptorOffset = descriptorStart;
    faces.forEach((face, faceIndex) => {
      const faceOffset = faceStart + faceIndex * FACE_RECORD_SIZE;
      writeUint32(output, faceOffset, encodeBackgroundColor(face.bgColor));
      if (face.previewKey) writeUint32(output, faceOffset + 4, payloadByKey.get(face.previewKey)!.offset);
      for (let type = 0; type < ELEMENT_TYPE_COUNT; type += 1) {
        const table = face.descriptors[type];
        writeUint32(output, faceOffset + 8 + type * 8, table.length);
        writeUint32(output, faceOffset + 12 + type * 8, descriptorOffset);
        for (const descriptor of table) {
          const payload = payloadByKey.get(descriptor.payloadKey);
          if (!payload) throw new Error(`描述符缺少资源 ${descriptor.payloadKey}`);
          writeUint16(output, descriptorOffset, descriptor.id);
          output[descriptorOffset + 2] = descriptor.flags ?? 0;
          output[descriptorOffset + 3] = descriptor.type;
          writeUint32(output, descriptorOffset + 8, payload.offset);
          writeUint32(output, descriptorOffset + 12, payload.bytes.length);
          descriptorOffset += DESCRIPTOR_SIZE;
        }
      }
      output.set(new TextEncoder().encode(face.name).subarray(0, THEME_NAME_SIZE), faceOffset + FACE_HEADER_SIZE);
      if (face.aod) writeUint32(output, faceOffset + FACE_RECORD_SIZE - 4, 1);
    });
    for (const payload of orderedPayloads) output.set(payload.bytes, payload.offset);
    onProgress?.({ stage: "assemble", completed: 1, total: 1 });

    return {
      bytes: output,
      size: output.length,
      sha256: await sha256(output),
      faceCount: faces.length,
      resourceCount: indexed.length,
    };
  } catch (error) {
    throw compileFailure(error);
  }
}

export type {
  CompileInput,
  CompileOptions,
  CompileProgress,
  CompileResult,
  CompileStage,
} from "./types";
export { WatchfaceCompileError } from "./types";
