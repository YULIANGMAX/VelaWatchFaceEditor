import {
  createId,
  getResourceName,
  normalizePath,
  refName,
  type Attributes,
  type Diagnostic,
  type ResourceType,
  type WatchfaceProject,
  type WatchfaceResource,
} from "./model";
import {
  FORMAT_RESOURCE_DEFINITION_MAP,
  FORMAT_STRUCTURE,
  isFormatFieldRequired,
  isFormatFieldVisible,
  type FormatFieldDefinition,
} from "../format-definition/manifestFormat";
import { resourceAssetPaths } from "./xml";
import { validateResourceSemanticRules, validateRootSemanticRules } from "./semanticRules";
import {
  getDeviceProfile,
  isDataSourceSupported,
  isManifestAttributeSupported,
  isManifestAttributeValueSupported,
  isManifestResourceSupported,
  type DeviceType,
} from "../device-definition";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATA_SOURCE_PATTERN = /^(?:[A-Za-z][A-Za-z0-9]*|[0-9a-fA-F]+)$/;

export const SEVERITY_ORDER: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const orderA = SEVERITY_ORDER[a.severity] ?? 99;
    const orderB = SEVERITY_ORDER[b.severity] ?? 99;
    return orderA - orderB;
  });
}

export function getDataSourceValidationError(
  device: DeviceType,
  value: string,
  fieldKey = "source",
): { code: string; message: string } | null {
  if (!value) return null;
  if (!DATA_SOURCE_PATTERN.test(value)) {
    return { code: "invalid-data-source", message: `${fieldKey} 必须为指标名称或不带 0x 的十六进制代码` };
  }
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 !== 0) {
    return { code: "odd-length-data-source", message: `${fieldKey} 的十六进制代码必须为偶数长度` };
  }
  if (/^[A-Za-z]/.test(value) && !getDeviceProfile(device).dataSources.codes[value]) {
    return { code: "unknown-data-source", message: `未知数据源 ${value}` };
  }
  if (!isDataSourceSupported(device, value)) {
    return { code: "unsupported-device-data-source", message: `设备 ${device} 不支持数据源 ${value}` };
  }
  return null;
}

function item(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  location: string,
): Diagnostic {
  return { id: createId("diagnostic"), severity, code, message, location };
}

function numberValue(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resourcesOfTypes(
  resourcesByName: Map<string, WatchfaceResource[]>,
  value: string,
  types?: readonly ResourceType[],
): WatchfaceResource[] {
  const resources = resourcesByName.get(refName(value)) ?? [];
  return types ? resources.filter((resource) => types.includes(resource.type)) : resources;
}

function validateReference(
  value: string,
  field: FormatFieldDefinition,
  resourcesByName: Map<string, WatchfaceResource[]>,
  location: string,
): Diagnostic[] {
  if (!value) return [];
  if (!value.startsWith("@") || value.length === 1) {
    return [item("error", "invalid-reference-syntax", `${field.key} 必须使用 @资源名`, location)];
  }
  const allTargets = resourcesByName.get(refName(value)) ?? [];
  if (allTargets.length === 0) {
    return [item("error", "missing-reference", `${field.key} 引用了不存在的资源 ${value}`, location)];
  }
  if (field.referenceTypes && resourcesOfTypes(resourcesByName, value, field.referenceTypes).length === 0) {
    return [item(
      "error",
      "wrong-reference-type",
      `${field.key} 只能引用 ${field.referenceTypes.join("/")}，当前为 ${allTargets.map((target) => target.type).join("/")}`,
      location,
    )];
  }
  return [];
}

function validateFields(
  fields: FormatFieldDefinition[],
  attrs: Attributes,
  resourcesByName: Map<string, WatchfaceResource[]>,
  location: string,
  device: DeviceType,
  capabilityTarget: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(attrs)) {
    if (!known.has(key)) diagnostics.push(item(
      "error",
      "unknown-manifest-attribute",
      `${capabilityTarget}.${key} 尚未进入格式规范，已原样保留但不能编译`,
      location,
    ));
  }
  for (const field of fields) {
    const value = attrs[field.key] ?? "";
    if (value && !isManifestAttributeSupported(device, capabilityTarget, field.key)) {
      diagnostics.push(item("error", "unsupported-device-attribute", `设备 ${device} 不支持 ${capabilityTarget}.${field.key}`, location));
    }
    if (value && !isManifestAttributeValueSupported(device, capabilityTarget, field.key, value)) {
      diagnostics.push(item("error", "unverified-manifest-value", `设备 ${device} 尚未验证 ${capabilityTarget}.${field.key}=${value} 的二进制编码`, location));
    }
    if (isFormatFieldRequired(field, attrs) && !value) {
      diagnostics.push(item("error", "missing-attribute", `缺少必填属性 ${field.key}`, location));
      continue;
    }
    if (!value) continue;
    if (!isFormatFieldVisible(field, attrs)) {
      diagnostics.push(item("error", "field-not-applicable", `${field.key} 不适用于当前 ${field.visibleWhen?.key} 设置`, location));
    }
    if (field.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        diagnostics.push(item("error", "invalid-number", `${field.key} 必须为数字`, location));
      } else {
        if (field.minimum !== undefined && numeric < field.minimum) diagnostics.push(item("error", "number-too-small", `${field.key} 不得小于 ${field.minimum}`, location));
        if (field.maximum !== undefined && numeric > field.maximum) diagnostics.push(item("error", "number-too-large", `${field.key} 不得大于 ${field.maximum}`, location));
      }
    }
    if (field.enum && !field.enum.includes(value)) {
      diagnostics.push(item("error", "invalid-option", `${field.key} 的值 ${value} 不是支持的预设选项`, location));
    }
    if (field.type === "boolean" && value !== "true" && value !== "false") {
      diagnostics.push(item("error", "invalid-boolean", `${field.key} 只能为 true 或 false`, location));
    }
    if (field.type === "color" && !COLOR_PATTERN.test(value)) {
      diagnostics.push(item("error", "invalid-color", `${field.key} 必须为 #RRGGBB`, location));
    }
    if (field.type === "reference") {
      diagnostics.push(...validateReference(value, field, resourcesByName, location));
    }
    if (field.type === "textOrReference" && value.startsWith("@")) {
      diagnostics.push(...validateReference(value, field, resourcesByName, location));
    }
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      diagnostics.push(item("error", field.patternErrorCode ?? "invalid-pattern", field.patternErrorMessage ?? `${field.key} 格式无效`, location));
    }
    if (field.type === "dataSource") {
      const err = getDataSourceValidationError(device, value, field.key);
      if (err) {
        diagnostics.push(item("error", err.code, err.message, location));
      }
    }
  }
  return diagnostics;
}

function validateImageAsset(
  project: WatchfaceProject,
  path: string,
  location: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!/\.png$/i.test(path)) diagnostics.push(item("error", "invalid-image-extension", `图片资源必须使用 PNG：${path}`, location));
  const asset = project.assets[normalizePath(path)];
  if (!asset) diagnostics.push(item("error", "missing-asset", `找不到文件 ${path}`, location));
  return diagnostics;
}

function validateChildren(
  project: WatchfaceProject,
  resource: WatchfaceResource,
  resourcesByName: Map<string, WatchfaceResource[]>,
  location: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const childDefinition = FORMAT_RESOURCE_DEFINITION_MAP[resource.type].child;
  if (!childDefinition) return diagnostics;
  resource.children.forEach((child, index) => {
    const childLocation = `${location}/${childDefinition.tag}[${index + 1}]`;
    diagnostics.push(...validateFields(childDefinition.fields, child.attrs, resourcesByName, childLocation, project.device, `${resource.type}/${childDefinition.tag}`));
    if (childDefinition.tag === "Image" && child.attrs.src) {
      diagnostics.push(...validateImageAsset(project, child.attrs.src, childLocation));
    }
  });
  return diagnostics;
}

function validateResource(
  project: WatchfaceProject,
  resource: WatchfaceResource,
  resourcesByName: Map<string, WatchfaceResource[]>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const name = getResourceName(resource);
  const location = `Resources/${resource.type}[@name='${name || "?"}']`;
  const definition = FORMAT_RESOURCE_DEFINITION_MAP[resource.type];

  diagnostics.push(...validateFields(definition.fields, resource.attrs, resourcesByName, location, project.device, resource.type));
  diagnostics.push(...validateChildren(project, resource, resourcesByName, location));
  diagnostics.push(...validateResourceSemanticRules(resource, location));
  if (!isManifestResourceSupported(project.device, resource.type)) {
    diagnostics.push(item("error", "unsupported-device-resource", `设备 ${project.device} 不支持资源类型 ${resource.type}`, location));
  }
  if (!name) diagnostics.push(item("error", "missing-name", "资源名称不能为空", location));

  for (const path of resourceAssetPaths(resource)) {
    if (resource.type === "File" && !project.assets[normalizePath(path)]) {
      diagnostics.push(item("error", "missing-asset", `找不到文件 ${path}`, location));
    }
  }

  if (resource.type === "Image" && resource.attrs.src) {
    diagnostics.push(...validateImageAsset(project, resource.attrs.src, location));
  }

  if (resource.type === "ImageArray") {
    const sizes = resource.children
      .map((child) => project.assets[normalizePath(child.attrs.src ?? "")])
      .filter((asset) => asset?.width && asset?.height)
      .map((asset) => `${asset.width}x${asset.height}`);
    if (new Set(sizes).size > 1) diagnostics.push(item("error", "image-array-size-mismatch", "ImageArray 中所有 PNG 必须尺寸相同", location));
  }

  if ((resource.type === "Image" || resource.type === "ImageArray") && resource.attrs.format === "indexed8") {
    diagnostics.push(item("info", "indexed8-color-check", "indexed8 最多允许 256 个精确颜色，编译时会严格检查", location));
  }

  if (resource.type === "DataItemImageNumber") {
    const target = resourcesOfTypes(resourcesByName, resource.attrs.ref, ["ImageArray"])[0];
    if (target && target.children.length < 2) diagnostics.push(item("error", "insufficient-digit-images", "数字序列至少需要 2 张图片", location));
    if (numberValue(resource.attrs.decimalDigits) > 0 && target && target.children.length < 12) diagnostics.push(item("warning", "missing-decimal-image", "显示小数时建议提供第 12 张小数点图片", location));
  }

  if (resource.type === "DataItemImageValues") {
    const values = resource.children.map((child) => numberValue(child.attrs.value, Number.NaN));
    if (values.some((value, index) => index > 0 && value < values[index - 1])) diagnostics.push(item("warning", "unsorted-params", "Param value 未按升序排列；Quantum 亦存在特例，需以编译器和设备结果为准", location));
    const target = resourcesOfTypes(resourcesByName, resource.attrs.ref, ["ImageArray"])[0];
    if (target && resource.children.length > target.children.length) diagnostics.push(item("error", "too-many-params", "Param 数量不能多于图片数量", location));
  }

  if (resource.attrs.supportRecolor === "true") {
    if (!project.watchface.recolorTable?.trim()) {
      diagnostics.push(item("error", "missing-recolor-table", "启用 supportRecolor 需要在 Watchface 中定义 recolorTable", location));
    }
    const target = resourcesOfTypes(resourcesByName, resource.attrs.ref, ["Image", "ImageArray"])[0];
    if (target && target.attrs.recolorEnable !== "true") {
      diagnostics.push(item("warning", "recolor-target-not-enabled", `引用资源 ${resource.attrs.ref} 未开启允许换色（recolorEnable="true"），跟随换色可能无法生效`, location));
    }
  }

  if ((resource.type === "Image" || resource.type === "ImageArray") && resource.attrs.recolorEnable === "true") {
    if (!project.watchface.recolorTable?.trim()) {
      diagnostics.push(item("error", "missing-recolor-table", `资源 ${resource.attrs.name} 开启 recolorEnable 需要在 Watchface 中定义 recolorTable`, location));
    }
  }

  return diagnostics;
}

function parseColorTable(value: string | undefined, key: string, diagnostics: Diagnostic[]): string[] {
  if (!value) return [];
  const colors = value.split(",").map((entry) => entry.trim());
  if (colors.some((color) => !COLOR_PATTERN.test(color))) diagnostics.push(item("error", "invalid-color-table", `${key} 必须是逗号分隔的 #RRGGBB 颜色`, "/Watchface"));
  if (new Set(colors.map((color) => color.toLowerCase())).size !== colors.length) diagnostics.push(item("error", "duplicate-table-color", `${key} 不能包含重复颜色`, "/Watchface"));
  return colors;
}

function validateCompositeCycles(project: WatchfaceProject): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const composites = new Map(project.resources.filter((resource) => resource.type === "Widget" || resource.type === "Slot").map((resource) => [getResourceName(resource), resource]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (name: string, path: string[]) => {
    if (visiting.has(name)) {
      diagnostics.push(item("error", "cyclic-composite-reference", `Widget/Slot 循环引用：${[...path, name].join(" -> ")}`, "Resources"));
      return;
    }
    if (visited.has(name)) return;
    const composite = composites.get(name);
    if (!composite) return;
    visiting.add(name);
    for (const child of composite.children) {
      const target = refName(child.attrs.ref);
      if (composites.has(target)) walk(target, [...path, name]);
    }
    visiting.delete(name);
    visited.add(name);
  };
  composites.forEach((_, name) => walk(name, []));
  return diagnostics;
}

export function validateProject(project: WatchfaceProject): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const resourcesByName = new Map<string, WatchfaceResource[]>();
  for (const extension of project.manifestExtensions) {
    diagnostics.push(item(
      "error",
      "unknown-manifest-extension",
      `未知 XML 节点已原样保留，但不能编译：${extension.xml.slice(0, 80)}`,
      "manifest.xml",
    ));
  }
  for (const resource of project.resources) {
    const entries = resourcesByName.get(getResourceName(resource)) ?? [];
    entries.push(resource);
    resourcesByName.set(getResourceName(resource), entries);
  }

  diagnostics.push(...validateFields(FORMAT_STRUCTURE.root.fields, project.watchface, resourcesByName, "/Watchface", project.device, "Watchface"));
  diagnostics.push(...validateRootSemanticRules(project.watchface, "/Watchface"));
  const deviceProfile = getDeviceProfile(project.device);
  if (project.watchface.width && Number(project.watchface.width) !== deviceProfile.width) {
    diagnostics.push(item("error", "device-width-mismatch", `Watchface.width 必须等于设备宽度 ${deviceProfile.width}`, "/Watchface"));
  }
  if (project.watchface.height && Number(project.watchface.height) !== deviceProfile.height) {
    diagnostics.push(item("error", "device-height-mismatch", `Watchface.height 必须等于设备高度 ${deviceProfile.height}`, "/Watchface"));
  }
  parseColorTable(project.watchface.recolorTable, "recolorTable", diagnostics);
  const colorGroups = parseColorTable(project.watchface.colorGroupTable, "colorGroupTable", diagnostics);

  if (project.canvas.width <= 0 || project.canvas.height <= 0) diagnostics.push(item("error", "invalid-canvas", "画布宽高必须大于 0", "编辑器设置"));
  if (project.canvas.radius < 0) diagnostics.push(item("error", "invalid-canvas-radius", "画布圆角不得小于 0", "编辑器设置"));

  for (const [resourceName, resources] of resourcesByName) {
    if (!resourceName) continue;
    for (const resource of resources) {
      const group = resource.attrs.colorGroup;
      if (group && !colorGroups.some((color) => color.toLowerCase() === group.toLowerCase())) diagnostics.push(item("error", "unknown-color-group", `${resourceName} 的 colorGroup 不在 colorGroupTable 中`, "Resources"));
    }
    const declaredGroups = resources.map((resource) => resource.attrs.colorGroup).filter(Boolean).map((group) => group.toLowerCase());
    if (declaredGroups.length > 0 && colorGroups.length > 0 && !resources.some((resource) => !resource.attrs.colorGroup) && !declaredGroups.includes(colorGroups[0].toLowerCase())) {
      diagnostics.push(item("error", "missing-first-color-group", `资源 ${resourceName} 缺少第一种颜色 ${colorGroups[0]}`, "Resources"));
    }
    if (resources.length < 2) continue;
    const groups = resources.map((resource) => resource.attrs.colorGroup).filter(Boolean);
    const normalized = groups.map((group) => group.toLowerCase());
    const valid = colorGroups.length > 0 && groups.length === resources.length && new Set(normalized).size === groups.length;
    if (!valid) diagnostics.push(item("error", "duplicate-resource-name", `资源名称 ${resourceName} 重复且颜色组定义不完整`, "Resources"));
  }

  for (const resource of project.resources) diagnostics.push(...validateResource(project, resource, resourcesByName));
  diagnostics.push(...validateCompositeCycles(project));

  const normalThemes = project.themes.filter((theme) => theme.attrs.type === "normal");
  const aodThemes = project.themes.filter((theme) => theme.attrs.type === "AOD");
  if (normalThemes.length === 0) diagnostics.push(item("error", "missing-normal-theme", "至少需要一个 normal 主题", "/Watchface"));
  if (aodThemes.length > 1 && aodThemes.length !== normalThemes.length) diagnostics.push(item("error", "invalid-aod-count", "多个 AOD 时，其数量必须与 normal 主题数量相同", "/Watchface"));

  for (const theme of project.themes) {
    const location = `Theme[@name='${theme.attrs.name || theme.attrs.type || "?"}']`;
    diagnostics.push(...validateFields(FORMAT_STRUCTURE.theme.fields, theme.attrs, resourcesByName, location, project.device, "Theme"));
    if (theme.attrs.type === "normal" && !theme.attrs.preview) diagnostics.push(item("warning", "missing-theme-preview", "normal 主题建议设置预览图片", location));
    for (const [layoutIndex, layout] of theme.layouts.entries()) {
      const layoutLocation = `${location}/Layout[${layoutIndex + 1}]`;
      diagnostics.push(...validateFields(FORMAT_STRUCTURE.theme.child.fields, layout.attrs, resourcesByName, layoutLocation, project.device, "Layout"));
    }
  }

  const usedAssets = new Set(project.resources.flatMap(resourceAssetPaths));
  for (const path of Object.keys(project.assets)) {
    if (!usedAssets.has(path)) diagnostics.push(item("info", "unused-asset", `文件未被 manifest.xml 引用：${path}`, "项目文件"));
  }
  return sortDiagnostics(diagnostics);
}
