import manifestSpecJson from "./manifest-spec.json";
import type { Attributes, ResourceType } from "../core/model";

export type FormatValueType = "string" | "number" | "boolean" | "color" | "reference" | "textOrReference" | "asset" | "dataSource";

export interface FormatCondition {
  key: string;
  values: readonly string[];
}

export interface FormatFieldDefinition {
  key: string;
  type: FormatValueType;
  required?: boolean;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  patternErrorCode?: string;
  patternErrorMessage?: string;
  assetType?: "image" | "any";
  visibleWhen?: FormatCondition;
  requiredWhen?: FormatCondition;
  referenceTypes?: readonly ResourceType[];
}

export interface FormatChildDefinition {
  tag: string;
  fields: FormatFieldDefinition[];
}

export interface FormatResourceDefinition {
  type: ResourceType;
  fields: FormatFieldDefinition[];
  defaults: Attributes;
  child?: FormatChildDefinition;
  extraChildren?: FormatChildDefinition[];
}

export interface ManifestFormatSpec {
  $schema?: string;
  schemaVersion: 1;
  format: string;
  structure: {
    root: { tag: string; fields: FormatFieldDefinition[]; children: Array<{ tag: string; minimum: number; maximum?: number }> };
    resources: { tag: string; resourceTypes: ResourceType[] };
    theme: { tag: string; fields: FormatFieldDefinition[]; child: FormatChildDefinition };
  };
  resources: FormatResourceDefinition[];
}

function fail(message: string): never {
  throw new Error(`manifest-spec.json 无效：${message}`);
}

function validateFields(fields: FormatFieldDefinition[], location: string, resourceTypes: Set<string>): void {
  const keys = new Set<string>();
  for (const field of fields) {
    if (!field.key || !field.type) fail(`${location} 存在不完整字段定义`);
    if (keys.has(field.key)) fail(`${location} 重复定义属性 ${field.key}`);
    keys.add(field.key);
    if (field.enum?.length === 0) fail(`${location}.${field.key} 的 enum 不能为空`);
    if (field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum) {
      fail(`${location}.${field.key} 的 minimum 大于 maximum`);
    }
    if (field.pattern) {
      try { new RegExp(field.pattern); } catch { fail(`${location}.${field.key} 的 pattern 无效`); }
    }
    for (const target of field.referenceTypes ?? []) {
      if (!resourceTypes.has(target)) fail(`${location}.${field.key} 引用了未知资源类型 ${target}`);
    }
  }
  for (const field of fields) {
    for (const condition of [field.visibleWhen, field.requiredWhen]) {
      if (condition && !keys.has(condition.key)) fail(`${location}.${field.key} 的条件引用了未知属性 ${condition.key}`);
    }
  }
}

export function loadManifestSpec(value: unknown): ManifestFormatSpec {
  if (!value || typeof value !== "object") fail("根值必须是对象");
  const spec = value as ManifestFormatSpec;
  if (spec.schemaVersion !== 1) fail(`不支持 schemaVersion ${String(spec.schemaVersion)}`);
  if (!spec.structure?.root?.tag || !spec.structure.resources?.tag || !spec.structure.theme?.tag) fail("structure 不完整");
  if (!Array.isArray(spec.resources) || spec.resources.length === 0) fail("resources 不能为空");
  const types = spec.resources.map((definition) => definition.type);
  const typeSet = new Set<string>(types);
  if (typeSet.size !== types.length) fail("资源类型重复");
  if (spec.structure.resources.resourceTypes.length !== types.length
    || spec.structure.resources.resourceTypes.some((type) => !typeSet.has(type))) {
    fail("structure.resources.resourceTypes 必须与 resources 定义一致");
  }
  validateFields(spec.structure.root.fields, spec.structure.root.tag, typeSet);
  validateFields(spec.structure.theme.fields, spec.structure.theme.tag, typeSet);
  validateFields(spec.structure.theme.child.fields, spec.structure.theme.child.tag, typeSet);
  const rootChildren = new Set(spec.structure.root.children.map((child) => child.tag));
  if (!rootChildren.has(spec.structure.resources.tag) || !rootChildren.has(spec.structure.theme.tag)) fail("根节点 children 不完整");
  for (const definition of spec.resources) {
    validateFields(definition.fields, definition.type, typeSet);
    if (definition.child) validateFields(definition.child.fields, `${definition.type}/${definition.child.tag}`, typeSet);
    for (const extra of definition.extraChildren ?? []) {
      validateFields(extra.fields, `${definition.type}/${extra.tag}`, typeSet);
    }
    const keys = new Set(definition.fields.map((field) => field.key));
    for (const key of Object.keys(definition.defaults)) if (!keys.has(key)) fail(`${definition.type}.defaults 包含未知属性 ${key}`);
  }
  return spec;
}

export const MANIFEST_SPEC = loadManifestSpec(manifestSpecJson);
export const FORMAT_STRUCTURE = MANIFEST_SPEC.structure;
export const FORMAT_RESOURCE_DEFINITIONS = MANIFEST_SPEC.resources;
export const FORMAT_RESOURCE_DEFINITION_MAP = Object.fromEntries(
  FORMAT_RESOURCE_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<ResourceType, FormatResourceDefinition>;

export const ROOT_ATTRIBUTE_NAMES = new Set(FORMAT_STRUCTURE.root.fields.map((field) => field.key));
export const THEME_ATTRIBUTE_NAMES = new Set(FORMAT_STRUCTURE.theme.fields.map((field) => field.key));
export const LAYOUT_ATTRIBUTE_NAMES = new Set(FORMAT_STRUCTURE.theme.child.fields.map((field) => field.key));

export function getResourceChildDefinition(
  definition: FormatResourceDefinition,
  tag: string,
): FormatChildDefinition | undefined {
  if (definition.child?.tag === tag) return definition.child;
  return definition.extraChildren?.find((c) => c.tag === tag);
}

export function formatConditionMatches(condition: FormatCondition | undefined, attrs: Attributes): boolean {
  return !condition || condition.values.includes(attrs[condition.key] ?? "");
}

export function isFormatFieldVisible(field: FormatFieldDefinition, attrs: Attributes): boolean {
  return formatConditionMatches(field.visibleWhen, attrs);
}

export function isFormatFieldRequired(field: FormatFieldDefinition, attrs: Attributes): boolean {
  return Boolean(field.required || (field.requiredWhen && formatConditionMatches(field.requiredWhen, attrs)));
}

function enumOptions(type: ResourceType, key: string, child = false): readonly string[] {
  const definition = FORMAT_RESOURCE_DEFINITION_MAP[type];
  const fields = child ? definition.child?.fields ?? [] : definition.fields;
  const field = fields.find((entry) => entry.key === key);
  if (!field?.enum) fail(`${type}.${key} 未声明 enum`);
  return field.enum;
}

export const TRANSLATION_LANGUAGES = enumOptions("Translation", "language", true);
export const JUMP_APPS = enumOptions("Widget", "jumpApp");
