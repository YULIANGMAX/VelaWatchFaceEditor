import {
  DEVICE_PROFILES,
  DEVICE_PROFILE_MAP,
  DEVICE_SIZES,
  findDeviceProfile,
  getDeviceDefinition,
  getDeviceProfile,
  type DeviceProfile,
  type DeviceType,
} from "../device-definition";
import manifestSpec from "../format-definition/manifest-spec.json";

export {
  DEVICE_PROFILES,
  DEVICE_PROFILE_MAP,
  DEVICE_SIZES,
  findDeviceProfile,
  getDeviceDefinition,
  getDeviceProfile,
  type DeviceProfile,
  type DeviceType,
};
export const PROJECT_EDITOR_VERSION = "0.1.0";

export type ResourceType = (typeof manifestSpec.resources)[number]["type"];

export type Attributes = Record<string, string>;

export interface ResourceItem {
  id: string;
  attrs: Attributes;
}

export interface WatchfaceResource {
  id: string;
  type: ResourceType;
  attrs: Attributes;
  children: ResourceItem[];
}

export interface ThemeLayout {
  id: string;
  attrs: Attributes;
}

export interface WatchfaceTheme {
  id: string;
  attrs: Attributes;
  layouts: ThemeLayout[];
}

export interface ProjectAsset {
  path: string;
  blob: Blob;
  url: string;
  lastModified?: number;
  width?: number;
  height?: number;
  imageMetadataLoaded?: boolean;
}

export interface WatchfacePreviewContext {
  color: string;
  elapsedMs: number;
  temperatureUnit: "celsius" | "fahrenheit";
  metrics: Record<string, number | string>;
}

export type ManifestExtensionParent = "Watchface" | "Resources" | "Theme" | "Resource";

/** 尚未进入格式规范的 XML 子节点。仅用于无损往返，编译器必须拒绝。 */
export interface ManifestExtensionNode {
  id: string;
  parent: ManifestExtensionParent;
  parentId?: string;
  index: number;
  xml: string;
}

export interface WatchfaceProject {
  device: DeviceType;
  canvas: {
    width: number;
    height: number;
    radius: number;
  };
  description: Attributes;
  watchface: Attributes;
  resources: WatchfaceResource[];
  themes: WatchfaceTheme[];
  manifestExtensions: ManifestExtensionNode[];
  assets: Record<string, ProjectAsset>;
  assetFolders: string[];
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  location: string;
  boundary?: boolean;
}

export interface ParseResult {
  project: WatchfaceProject | null;
  diagnostics: Diagnostic[];
  blocked: boolean;
  newProject?: boolean;
}

let idSequence = 0;

export function createId(prefix: string): string {
  idSequence += 1;
  return `${prefix}-${idSequence.toString(36)}`;
}

export function generateWatchfaceId(): string {
  const words = crypto.getRandomValues(new Uint32Array(2));
  const random = (BigInt(words[0]) << 32n) | BigInt(words[1]);
  return (random % 900_000_000_000n + 100_000_000_000n).toString();
}

export function generateProjectId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function formatProjectTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${offsetSign}${offsetHours}:${offsetRemainder}`,
  ].join("");
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function getResourceName(resource: WatchfaceResource): string {
  return resource.attrs.name ?? "";
}

export function refName(value: string | undefined): string {
  return value?.startsWith("@") ? value.slice(1) : value ?? "";
}

const TRANSLATION_FALLBACK_LANGUAGES = ["zh_CN", "en_US"] as const;

/** 运行环境的语言列表（浏览器 locale，如 ["zh-CN", "zh", "en"]）。 */
export function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  if (navigator.language) return [navigator.language];
  return [];
}

function preferredLanguageKeys(languages: readonly string[]): string[] {
  const keys: string[] = [];
  for (const language of languages) {
    const normalized = language.replace("-", "_");
    if (!keys.includes(normalized)) keys.push(normalized);
    const base = normalized.split("_")[0];
    if (base && !keys.includes(base)) keys.push(base);
  }
  return keys;
}

/**
 * 按运行环境语言解析 Translation 资源对应的翻译文本。
 * 语言匹配：完整 locale（zh_CN）→ 语言前缀（zh）→ 回退 zh_CN / en_US → 第一个条目。
 */
export function translationText(
  resource: WatchfaceResource | undefined,
  languages: readonly string[] = systemLanguages(),
): string {
  if (!resource || resource.type !== "Translation") return "";
  const entries = resource.children;
  const byLanguage = (key: string) => entries.find((child) => child.attrs.language === key)?.attrs.str;
  for (const key of preferredLanguageKeys(languages)) {
    const text = byLanguage(key);
    if (text) return text;
  }
  for (const key of TRANSLATION_FALLBACK_LANGUAGES) {
    const text = byLanguage(key);
    if (text) return text;
  }
  return entries[0]?.attrs.str ?? "";
}

/** 表盘名称显示文本：`@Translation` 引用按运行环境语言解析，普通文本原样返回，空值回退为「未命名表盘」。 */
export function watchfaceDisplayName(
  project: Pick<WatchfaceProject, "watchface" | "resources">,
  languages: readonly string[] = systemLanguages(),
): string {
  const raw = project.watchface.name;
  if (!raw) return "未命名表盘";
  if (!raw.startsWith("@")) return raw;
  const resource = project.resources.find(
    (entry) => entry.attrs.name === refName(raw) && entry.type === "Translation",
  );
  const text = translationText(resource, languages);
  return text || raw;
}

export function cloneProject(project: WatchfaceProject): WatchfaceProject {
  return {
    ...project,
    canvas: { ...project.canvas },
    description: { ...project.description },
    watchface: { ...project.watchface },
    resources: project.resources.map((resource) => ({
      ...resource,
      attrs: { ...resource.attrs },
      children: resource.children.map((child) => ({
        ...child,
        attrs: { ...child.attrs },
      })),
    })),
    themes: project.themes.map((theme) => ({
      ...theme,
      attrs: { ...theme.attrs },
      layouts: theme.layouts.map((layout) => ({
        ...layout,
        attrs: { ...layout.attrs },
      })),
    })),
    manifestExtensions: project.manifestExtensions.map((extension) => ({ ...extension })),
    assets: { ...project.assets },
    assetFolders: [...project.assetFolders],
  };
}

export function createBlankProject(device: DeviceType = "O66"): WatchfaceProject {
  const size = DEVICE_SIZES[device];
  const id = generateWatchfaceId();
  const timestamp = formatProjectTimestamp();

  const isRound = size.radius >= Math.min(size.width, size.height) / 2 && size.width === size.height;

  return {
    device,
    canvas: { ...size },
    description: {
      shape: isRound ? "round" : "square",
      // 不预设 name：description.xml 的名称由 watchface.name 在保存/编辑时推导
      deviceType: device,
      version: "1.0.0",
      size: `${size.width}x${size.height}`,
      author: "VWFE",
      pkgName: id,
      watchOS: "vela",
      _id: generateProjectId(),
      imageFormat: "indexed8",
      imageCompression: "true",
      editorVersion: PROJECT_EDITOR_VERSION,
      webVersionCreatedAt: timestamp,
      editorVersionCreatedAt: PROJECT_EDITOR_VERSION,
      webVersionUpdatedAt: timestamp,
      editorVersionUpdatedAt: PROJECT_EDITOR_VERSION,
      watchfaceType: "normal",
      imageArrayRamMethod: "whole",
      _recolorEnable: "false",
      webVersionExportAt: timestamp,
      editorVersionExportAt: PROJECT_EDITOR_VERSION,
    },
    watchface: {
      id,
      name: "未命名表盘",
    },
    resources: [],
    themes: [
      {
        id: createId("theme"),
        attrs: {
          type: "normal",
          name: "样式1",
          bgColor: "#000000",
        },
        layouts: [],
      },
    ],
    manifestExtensions: [],
    assets: {},
    assetFolders: [...RESERVED_ASSET_FOLDERS],
  };
}

export const RESERVED_ASSET_FOLDERS = ["_preview", "_widget"] as const;
export type ReservedAssetFolder = (typeof RESERVED_ASSET_FOLDERS)[number];

export function isReservedAssetFolder(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return RESERVED_ASSET_FOLDERS.includes(normalized as ReservedAssetFolder);
}

export function isPreviewResource(resource: WatchfaceResource): boolean {
  const name = resource.attrs.name ?? "";
  const src = resource.attrs.src ?? "";
  return resource.type === "Image" && (
    name.startsWith("_preview_") ||
    name === "_preview" ||
    src.startsWith("_preview/") ||
    src.startsWith("_preview_") ||
    src.startsWith("_preview.")
  );
}

export function getThemePreviewUrl(project: WatchfaceProject, theme?: WatchfaceTheme): string | undefined {
  if (!theme) return undefined;

  // 1. 根据 theme.attrs.preview 查找对应 Image 资源
  if (theme.attrs.preview) {
    const previewName = refName(theme.attrs.preview);
    const resource = project.resources.find(
      (entry) => entry.type === "Image" && (entry.attrs.name === previewName || getResourceName(entry) === previewName),
    );
    if (resource?.attrs.src) {
      const normalized = normalizePath(resource.attrs.src);
      const asset = project.assets[normalized] || project.assets[resource.attrs.src];
      if (asset?.url) return asset.url;
    }
    const directPath = normalizePath(previewName);
    if (project.assets[directPath]?.url) return project.assets[directPath].url;
  }

  // 2. 备用：按 theme 命名约定查找（如保存时生成的 _preview_xxx）
  const themeIndex = project.themes.findIndex((t) => t.id === theme.id);
  const candidateNames = [
    `_preview_${theme.id}`,
    `_preview_${themeIndex}`,
    theme.attrs.name ? `_preview_${theme.attrs.name.trim()}` : "",
  ].filter(Boolean);

  for (const name of candidateNames) {
    const resource = project.resources.find(
      (entry) => entry.type === "Image" && (entry.attrs.name === name || getResourceName(entry) === name),
    );
    if (resource?.attrs.src) {
      const normalized = normalizePath(resource.attrs.src);
      const asset = project.assets[normalized] || project.assets[resource.attrs.src];
      if (asset?.url) return asset.url;
    }
  }

  // 3. 备用：查找匹配的 preview 资产路径
  const assetPaths = Object.keys(project.assets);
  const matchingAssetPath = assetPaths.find((path) => {
    const normalized = normalizePath(path);
    if (!normalized.startsWith("_preview/")) return false;
    if (normalized.includes(theme.id)) return true;
    if (themeIndex >= 0 && (normalized.includes(`preview_${themeIndex}`) || normalized.includes(`theme_${themeIndex}`))) return true;
    return false;
  }) || (themeIndex === 0 ? assetPaths.find((path) => normalizePath(path).startsWith("_preview/")) : undefined);

  if (matchingAssetPath && project.assets[matchingAssetPath]?.url) {
    return project.assets[matchingAssetPath].url;
  }

  return undefined;
}

