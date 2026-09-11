import { DESCRIPTION_EDITOR_FIELDS, MANIFEST_EDITOR_METADATA } from "./manifestEditorMetadata";
import {
  FORMAT_RESOURCE_DEFINITIONS,
  FORMAT_STRUCTURE,
  formatConditionMatches,
  type FormatCondition,
  type FormatFieldDefinition,
  type FormatValueType,
} from "../format-definition/manifestFormat";
import type { Attributes, ResourceType } from "../core/model";

export type FieldKind = "text" | "number" | "boolean" | "select" | "color" | "colorGroup" | "reference" | "textOrReference" | "asset" | "dataSource";
export type FieldSection = "common" | "normal" | "arc" | "application" | "flex" | "system";
export type PreviewSupport = "full" | "partial" | "device";

interface EditorFieldDefinition {
  key: string;
  label: string;
  control: FieldKind;
  step?: number;
  help?: string;
  action?: "generateWatchfaceId";
  section?: FieldSection;
  previewSupport?: PreviewSupport;
  readOnly?: boolean;
  hidden?: boolean;
}

export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  valueType: FormatValueType;
  required?: boolean;
  options?: readonly string[];
  min?: number;
  max?: number;
  pattern?: string;
  patternErrorCode?: string;
  patternErrorMessage?: string;
  step?: number;
  help?: string;
  action?: "generateWatchfaceId";
  assetType?: "image" | "any";
  section?: FieldSection;
  visibleWhen?: FormatCondition;
  requiredWhen?: FormatCondition;
  referenceTypes?: readonly ResourceType[];
  previewSupport?: PreviewSupport;
  readOnly?: boolean;
  hidden?: boolean;
}

interface EditorResourceDefinition {
  type: ResourceType;
  label: string;
  group: "基础" | "数据" | "组合";
  description: string;
  fields: EditorFieldDefinition[];
  child?: { tag: string; fields: EditorFieldDefinition[] };
}

export interface ChildDefinition {
  tag: string;
  fields: FieldDefinition[];
}

export interface ResourceDefinition {
  type: ResourceType;
  label: string;
  group: "基础" | "数据" | "组合";
  description: string;
  fields: FieldDefinition[];
  defaults: Attributes;
  child?: ChildDefinition;
}

function fail(message: string): never {
  throw new Error(`编辑器元数据无效：${message}`);
}

function mergeFields(formatFields: readonly FormatFieldDefinition[], editorFields: readonly EditorFieldDefinition[], location: string): FieldDefinition[] {
  const editorByKey = new Map(editorFields.map((field) => [field.key, field]));
  if (editorByKey.size !== editorFields.length) fail(`${location} 包含重复字段`);
  const fields = formatFields.map((formatField) => {
    const editorField = editorByKey.get(formatField.key);
    if (!editorField) fail(`${location} 缺少 ${formatField.key}`);
    editorByKey.delete(formatField.key);
    return {
      key: formatField.key,
      label: editorField.label,
      kind: editorField.control,
      valueType: formatField.type,
      required: formatField.required,
      options: formatField.enum,
      min: formatField.minimum,
      max: formatField.maximum,
      pattern: formatField.pattern,
      patternErrorCode: formatField.patternErrorCode,
      patternErrorMessage: formatField.patternErrorMessage,
      step: editorField.step,
      help: editorField.help,
      action: editorField.action,
      assetType: formatField.assetType,
      section: editorField.section,
      visibleWhen: formatField.visibleWhen,
      requiredWhen: formatField.requiredWhen,
      referenceTypes: formatField.referenceTypes,
      previewSupport: editorField.previewSupport,
      readOnly: editorField.readOnly,
      hidden: editorField.hidden,
    } satisfies FieldDefinition;
  });
  if (editorByKey.size > 0) fail(`${location} 包含未知字段 ${[...editorByKey.keys()].join("、")}`);
  return fields;
}

const metadata = MANIFEST_EDITOR_METADATA as unknown as {
  visualResourceTypes: ResourceType[];
  rootFields: EditorFieldDefinition[];
  themeFields: EditorFieldDefinition[];
  layoutFields: EditorFieldDefinition[];
  resources: EditorResourceDefinition[];
};
const metadataResources = new Map(metadata.resources.map((resource) => [resource.type, resource]));
if (metadataResources.size !== FORMAT_RESOURCE_DEFINITIONS.length) fail("资源类型数量与格式规范不一致");

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = FORMAT_RESOURCE_DEFINITIONS.map((format) => {
  const editor = metadataResources.get(format.type);
  if (!editor) fail(`缺少资源类型 ${format.type}`);
  if (format.child?.tag !== editor.child?.tag) fail(`${format.type} 的子元素不匹配`);
  return {
    type: format.type,
    label: editor.label,
    group: editor.group,
    description: editor.description,
    defaults: format.defaults,
    fields: mergeFields(format.fields, editor.fields, format.type),
    child: format.child && editor.child
      ? { tag: format.child.tag, fields: mergeFields(format.child.fields, editor.child.fields, `${format.type}/${format.child.tag}`) }
      : undefined,
  };
});

export const RESOURCE_DEFINITION_MAP = Object.fromEntries(
  RESOURCE_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<ResourceType, ResourceDefinition>;
export const WATCHFACE_FIELDS = mergeFields(FORMAT_STRUCTURE.root.fields, metadata.rootFields, "Watchface").filter(
  (field) => field.key !== "width" && field.key !== "height",
);
export const THEME_FIELDS = mergeFields(FORMAT_STRUCTURE.theme.fields, metadata.themeFields, "Theme");
export const LAYOUT_FIELDS = mergeFields(FORMAT_STRUCTURE.theme.child.fields, metadata.layoutFields, "Layout");
export const DESCRIPTION_FIELDS = DESCRIPTION_EDITOR_FIELDS as unknown as FieldDefinition[];

export function isFieldVisible(field: FieldDefinition, attrs: Attributes): boolean {
  return formatConditionMatches(field.visibleWhen, attrs);
}

export function isFieldRequired(field: FieldDefinition, attrs: Attributes): boolean {
  return Boolean(field.required || (field.requiredWhen && formatConditionMatches(field.requiredWhen, attrs)));
}
