import {
  formatProjectTimestamp,
  PROJECT_EDITOR_VERSION,
  watchfaceDisplayName,
  type Attributes,
  type WatchfaceProject,
} from "./model";

const DESCRIPTION_ORDER = [
  "shape",
  "name",
  "deviceType",
  "version",
  "size",
  "author",
  "pkgName",
  "watchOS",
  "_id",
  "imageFormat",
  "imageCompression",
  "editorVersion",
  "webVersionCreatedAt",
  "editorVersionCreatedAt",
  "webVersionUpdatedAt",
  "editorVersionUpdatedAt",
  "watchfaceType",
  "imageArrayRamMethod",
  "_recolorEnable",
  "webVersionExportAt",
  "editorVersionExportAt",
] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function parseDescription(xml: string): Attributes {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error(`description.xml 解析失败：${parserError.textContent ?? "未知错误"}`);
  if (document.documentElement.tagName !== "watch") {
    throw new Error("description.xml 根元素必须为 watch");
  }

  const values: Attributes = {};
  for (const node of Array.from(document.documentElement.children)) {
    if (node.children.length > 0) throw new Error(`description.xml 的 ${node.tagName} 必须为文本字段`);
    if (node.tagName in values) throw new Error(`description.xml 包含重复字段：${node.tagName}`);
    values[node.tagName] = node.textContent ?? "";
  }
  return values;
}

export function serializeDescription(project: WatchfaceProject): string {
  const timestamp = formatProjectTimestamp();
  const editorVersion = project.description.editorVersion || PROJECT_EDITOR_VERSION;
  const isRound = project.canvas.radius >= Math.min(project.canvas.width, project.canvas.height) / 2 && project.canvas.width === project.canvas.height;
  const values: Attributes = {
    webVersionCreatedAt: timestamp,
    editorVersionCreatedAt: editorVersion,
    webVersionUpdatedAt: timestamp,
    editorVersionUpdatedAt: editorVersion,
    webVersionExportAt: timestamp,
    editorVersionExportAt: editorVersion,
    ...project.description,
    name: watchfaceDisplayName(project),
    deviceType: project.device,
    size: `${project.canvas.width}x${project.canvas.height}`,
    pkgName: project.watchface.id ?? "",
    shape: project.description.shape || (isRound ? "round" : "square"),
    watchOS: "vela",
    // 官方固定表盘元数据规约，写死输出
    imageFormat: "indexed8",
    imageCompression: "true",
    watchfaceType: "normal",
    imageArrayRamMethod: "whole",
    _recolorEnable: "false",
  };
  const orderedKeys = [
    ...DESCRIPTION_ORDER.filter((key) => key in values),
    ...Object.keys(values).filter((key) => !DESCRIPTION_ORDER.includes(key as typeof DESCRIPTION_ORDER[number])),
  ];
  const fields = orderedKeys.map((key) => `    <${key}>${escapeXml(values[key])}</${key}>`);
  return ['<?xml version="1.0" encoding="utf-8"?>', "<watch>", ...fields, "</watch>", ""].join("\n");
}
