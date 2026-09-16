import {
  createBlankProject,
  createId,
  DEVICE_SIZES,
  normalizePath,
  type Attributes,
  type DeviceType,
  type Diagnostic,
  type ManifestExtensionNode,
  type ParseResult,
  type ResourceItem,
  type ResourceType,
  type WatchfaceProject,
  type WatchfaceResource,
  type WatchfaceTheme,
} from "./model";
import {
  FORMAT_RESOURCE_DEFINITION_MAP,
  FORMAT_STRUCTURE,
  getResourceChildDefinition,
  LAYOUT_ATTRIBUTE_NAMES,
  ROOT_ATTRIBUTE_NAMES,
  THEME_ATTRIBUTE_NAMES,
  type FormatResourceDefinition,
} from "../format-definition/manifestFormat";

const RESOURCE_TYPES = new Set(Object.keys(FORMAT_RESOURCE_DEFINITION_MAP));
const ROOT_TAG = FORMAT_STRUCTURE.root.tag;
const RESOURCES_TAG = FORMAT_STRUCTURE.resources.tag;
const THEME_TAG = FORMAT_STRUCTURE.theme.tag;
const LAYOUT_TAG = FORMAT_STRUCTURE.theme.child.tag;

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  location: string,
  boundary = false,
): Diagnostic {
  return {
    id: createId("diagnostic"),
    severity,
    code,
    message,
    location,
    boundary,
  };
}

function elementChildren(node: Element): Element[] {
  return Array.from(node.children);
}

function readAttributes(
  node: Element,
  allowed: Set<string>,
  location: string,
  diagnostics: Diagnostic[],
): Attributes {
  const attrs: Attributes = {};

  for (const attr of Array.from(node.attributes)) {
    if (!allowed.has(attr.name)) {
      diagnostics.push(
        diagnostic(
          "warning",
          "unsupported-attribute",
          `属性 ${attr.name} 尚未进入 manifest.xml 格式规范，将原样保留但禁止编译`,
          location,
        ),
      );
    }
    attrs[attr.name] = attr.value;
  }

  return attrs;
}

function resourceAttributeNames(definition: FormatResourceDefinition): Set<string> {
  return new Set(definition.fields.map((field) => field.key));
}

function childAllowedAttributes(resourceType: ResourceType, childTag: string): Set<string> {
  const definition = FORMAT_RESOURCE_DEFINITION_MAP[resourceType];
  const childDef = getResourceChildDefinition(definition, childTag);
  if (childDef) {
    return new Set(childDef.fields.map((field) => field.key));
  }
  return new Set();
}

function extensionNode(
  parent: ManifestExtensionNode["parent"],
  parentId: string | undefined,
  index: number,
  node: Element,
): ManifestExtensionNode {
  return {
    id: createId("extension"),
    parent,
    parentId,
    index,
    xml: new XMLSerializer().serializeToString(node),
  };
}

function parseResource(
  node: Element,
  diagnostics: Diagnostic[],
  extensions: ManifestExtensionNode[],
  resourceIndex: number,
): WatchfaceResource | null {
  if (!RESOURCE_TYPES.has(node.tagName)) {
    diagnostics.push(
      diagnostic(
        "warning",
        "unsupported-resource",
        `资源类型 ${node.tagName} 尚未进入格式规范，将原样保留但禁止编译`,
        `${RESOURCES_TAG}/${node.tagName}`,
      ),
    );
    extensions.push(extensionNode("Resources", undefined, resourceIndex, node));
    return null;
  }

  const type = node.tagName as ResourceType;
  const definition = FORMAT_RESOURCE_DEFINITION_MAP[type];
  const name = node.getAttribute("name") || "未命名";
  const location = `${RESOURCES_TAG}/${type}[@name='${name}']`;
  const resourceId = createId("resource");
  const attrs = readAttributes(node, resourceAttributeNames(definition), location, diagnostics);
  const children: ResourceItem[] = [];

  for (const child of elementChildren(node)) {
    const childDef = getResourceChildDefinition(definition, child.tagName);
    if (!childDef) {
      diagnostics.push(
        diagnostic(
          "warning",
          "unsupported-child",
          `${type} 的子元素 ${child.tagName} 尚未进入格式规范，将原样保留但禁止编译`,
          location,
        ),
      );
      extensions.push(extensionNode("Resource", resourceId, children.length, child));
      continue;
    }

    children.push({
      id: createId("child"),
      tag: child.tagName,
      attrs: readAttributes(
        child,
        childAllowedAttributes(type, child.tagName),
        `${location}/${child.tagName}`,
        diagnostics,
      ),
    });
  }

  return {
    id: resourceId,
    type,
    attrs,
    children,
  };
}

function parseTheme(node: Element, diagnostics: Diagnostic[], extensions: ManifestExtensionNode[]): WatchfaceTheme {
  const name = node.getAttribute("name") || node.getAttribute("type") || "未命名";
  const location = `${THEME_TAG}[@name='${name}']`;
  const themeId = createId("theme");
  const attrs = readAttributes(node, THEME_ATTRIBUTE_NAMES, location, diagnostics);
  const layouts = [];

  for (const child of elementChildren(node)) {
    if (child.tagName !== LAYOUT_TAG) {
      diagnostics.push(
        diagnostic(
          "warning",
          "unsupported-theme-child",
          `${THEME_TAG} 的子元素 ${child.tagName} 尚未进入格式规范，将原样保留但禁止编译`,
          location,
        ),
      );
      extensions.push(extensionNode("Theme", themeId, layouts.length, child));
      continue;
    }

    layouts.push({
      id: createId("layout"),
      attrs: readAttributes(child, LAYOUT_ATTRIBUTE_NAMES, `${location}/${LAYOUT_TAG}`, diagnostics),
    });
  }

  return { id: themeId, attrs, layouts };
}

export function parseManifest(
  xml: string,
  device: DeviceType = "O66",
  assets: WatchfaceProject["assets"] = {},
): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return {
      project: null,
      diagnostics: [
        diagnostic("error", "invalid-xml", `XML 解析失败：${parserError.textContent ?? "未知错误"}`, "manifest.xml"),
      ],
      blocked: true,
    };
  }

  const root = document.documentElement;
  if (root.tagName !== ROOT_TAG) {
    return {
      project: null,
      diagnostics: [
        diagnostic("error", "invalid-root", `根元素必须为 ${ROOT_TAG}`, `/${root.tagName}`, true),
      ],
      blocked: true,
    };
  }

  const project = createBlankProject(device);
  project.assets = assets;
  project.canvas = { ...DEVICE_SIZES[device] };
  project.watchface = readAttributes(root, ROOT_ATTRIBUTE_NAMES, `/${ROOT_TAG}`, diagnostics);
  project.resources = [];
  project.themes = [];
  project.manifestExtensions = [];

  let resourcesSeen = false;
  let rootKnownIndex = 0;
  for (const child of elementChildren(root)) {
    if (child.tagName === RESOURCES_TAG) {
      if (resourcesSeen) {
        diagnostics.push(
          diagnostic("error", "duplicate-resources", `${ROOT_TAG} 只能包含一个 ${RESOURCES_TAG}`, `/${ROOT_TAG}`, true),
        );
      }
      resourcesSeen = true;
      for (const resourceNode of elementChildren(child)) {
        const resource = parseResource(resourceNode, diagnostics, project.manifestExtensions, project.resources.length);
        if (resource) project.resources.push(resource);
      }
      rootKnownIndex += 1;
      continue;
    }

    if (child.tagName === THEME_TAG) {
      project.themes.push(parseTheme(child, diagnostics, project.manifestExtensions));
      rootKnownIndex += 1;
      continue;
    }

    diagnostics.push(
      diagnostic(
        "warning",
        "unsupported-root-child",
        `${ROOT_TAG} 的子元素 ${child.tagName} 尚未进入格式规范，将原样保留但禁止编译`,
        `/${ROOT_TAG}`,
      ),
    );
    project.manifestExtensions.push(extensionNode("Watchface", undefined, rootKnownIndex, child));
  }

  if (!resourcesSeen) {
    diagnostics.push(diagnostic("error", "missing-resources", `缺少 ${RESOURCES_TAG} 元素`, `/${ROOT_TAG}`));
  }

  const blocked = diagnostics.some((item) => item.boundary && item.severity === "error");
  return { project, diagnostics, blocked };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeAttributes(attrs: Attributes, order?: string[]): string {
  const keys = order
    ? [
        ...order.filter((key, index) => order.indexOf(key) === index && attrs[key] !== undefined),
        ...Object.keys(attrs).filter((key) => !order.includes(key)),
      ]
    : Object.keys(attrs);

  return keys
    .filter((key) => attrs[key] !== "")
    .map((key) => ` ${key}="${escapeXml(attrs[key])}"`)
    .join("");
}

function rawXmlLines(xml: string, indent: string): string[] {
  return xml.split(/\r?\n/).map((line) => `${indent}${line}`);
}

function mergeExtensionLines(
  known: string[][],
  extensions: readonly ManifestExtensionNode[],
  indent: string,
): string[] {
  const result: string[] = [];
  for (let index = 0; index <= known.length; index += 1) {
    for (const extension of extensions.filter((entry) => entry.index === index)) {
      result.push(...rawXmlLines(extension.xml, indent));
    }
    if (known[index]) result.push(...known[index]);
  }
  return result;
}

function serializeResource(
  resource: WatchfaceResource,
  indent: string,
  extensions: readonly ManifestExtensionNode[],
): string[] {
  const definition = FORMAT_RESOURCE_DEFINITION_MAP[resource.type];
  const order = definition.fields.map((field) => field.key);
  const attrs = serializeAttributes(resource.attrs, order);

  const childExtensions = extensions.filter((entry) => entry.parent === "Resource" && entry.parentId === resource.id);
  const hasChildDef = Boolean(definition.child || (definition.extraChildren && definition.extraChildren.length > 0));
  if ((!hasChildDef || resource.children.length === 0) && childExtensions.length === 0) {
    return [`${indent}<${resource.type}${attrs}/>`];
  }

  const lines = [`${indent}<${resource.type}${attrs}>`];
  const childLines = resource.children.map((child) => {
    let childTag = child.tag;
    if (!childTag) {
      if (child.attrs.x !== undefined || child.attrs.y !== undefined) {
        childTag = "Position";
      } else {
        childTag = definition.child?.tag ?? "Item";
      }
    }
    const childDefinition = getResourceChildDefinition(definition, childTag);
    return [
      `${indent}    <${childTag}${serializeAttributes(child.attrs, childDefinition?.fields.map((field) => field.key))}/>`
    ];
  });
  lines.push(...mergeExtensionLines(childLines, childExtensions, `${indent}    `));
  lines.push(`${indent}</${resource.type}>`);
  return lines;
}

export function serializeManifest(project: WatchfaceProject): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const rootOrder = FORMAT_STRUCTURE.root.fields.map((field) => field.key);
  lines.push(`<${ROOT_TAG}${serializeAttributes(project.watchface, rootOrder)}>`);
  const resourceLines = [`    <${RESOURCES_TAG}>`];
  const knownResources = project.resources.map((resource) => serializeResource(resource, "        ", project.manifestExtensions));
  resourceLines.push(...mergeExtensionLines(
    knownResources,
    project.manifestExtensions.filter((entry) => entry.parent === "Resources"),
    "        ",
  ));
  resourceLines.push(`    </${RESOURCES_TAG}>`);

  const themeLines = project.themes.map((theme) => {
    const themeAttrs = serializeAttributes(theme.attrs, FORMAT_STRUCTURE.theme.fields.map((field) => field.key));
    if (theme.layouts.length === 0) {
      const extensions = project.manifestExtensions.filter((entry) => entry.parent === "Theme" && entry.parentId === theme.id);
      if (extensions.length === 0) return [`    <${THEME_TAG}${themeAttrs}/>`];
    }
    const result = [`    <${THEME_TAG}${themeAttrs}>`];
    const layouts = theme.layouts.map((layout) => [
        `        <${LAYOUT_TAG}${serializeAttributes(layout.attrs, FORMAT_STRUCTURE.theme.child.fields.map((field) => field.key))}/>`
      ]);
    result.push(...mergeExtensionLines(
      layouts,
      project.manifestExtensions.filter((entry) => entry.parent === "Theme" && entry.parentId === theme.id),
      "        ",
    ));
    result.push(`    </${THEME_TAG}>`);
    return result;
  });

  lines.push(...mergeExtensionLines(
    [resourceLines, ...themeLines],
    project.manifestExtensions.filter((entry) => entry.parent === "Watchface"),
    "    ",
  ));

  lines.push(`</${ROOT_TAG}>`);
  return `${lines.join("\n")}\n`;
}

export function resourceAssetPaths(resource: WatchfaceResource): string[] {
  if (resource.type === "Image") return resource.attrs.src ? [normalizePath(resource.attrs.src)] : [];
  if (resource.type === "ImageArray") {
    return resource.children
      .map((child) => child.attrs.src)
      .filter(Boolean)
      .map(normalizePath);
  }
  if (resource.type === "File") {
    return resource.attrs.filename ? [normalizePath(resource.attrs.filename)] : [];
  }
  return [];
}
