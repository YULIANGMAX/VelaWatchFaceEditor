import { refName, type WatchfaceProject, type WatchfaceResource } from "../core/model";
import { LAYOUT_FIELDS, RESOURCE_DEFINITION_MAP, THEME_FIELDS, WATCHFACE_FIELDS, type FieldDefinition } from "./manifestEditorSchema";

export type ResourceReference =
  | { kind: "watchface"; fieldLabel: string }
  | { kind: "theme"; themeId: string; themeName: string; fieldLabel: string }
  | { kind: "layout"; themeId: string; themeName: string; layoutId: string }
  | { kind: "resource"; resourceId: string; resourceName: string; resourceType: string; fieldLabel: string }
  | { kind: "child"; resourceId: string; resourceName: string; resourceType: string; childIndex: number; fieldLabel: string };

const projectReferencesCache = new WeakMap<WatchfaceProject, Map<string, ResourceReference[]>>();

export function getProjectReferencesIndex(project: WatchfaceProject): Map<string, ResourceReference[]> {
  const cached = projectReferencesCache.get(project);
  if (cached) return cached;

  const index = new Map<string, ResourceReference[]>();
  const addRef = (name: string, ref: ResourceReference) => {
    if (!name) return;
    let list = index.get(name);
    if (!list) {
      list = [];
      index.set(name, list);
    }
    list.push(ref);
  };

  const collectFieldRefs = (
    fields: readonly FieldDefinition[],
    attrs: Record<string, string>,
    makeRef: (field: FieldDefinition) => ResourceReference,
  ) => {
    for (const field of fields) {
      if (field.kind !== "reference" && field.kind !== "textOrReference") continue;
      const raw = attrs[field.key];
      if (raw?.startsWith("@")) {
        const name = refName(raw);
        if (name) addRef(name, makeRef(field));
      }
    }
  };

  collectFieldRefs(WATCHFACE_FIELDS, project.watchface, (field) => ({ kind: "watchface", fieldLabel: field.label }));

  for (const theme of project.themes) {
    const themeName = theme.attrs.name || "未命名主题";
    collectFieldRefs(THEME_FIELDS, theme.attrs, (field) => ({
      kind: "theme",
      themeId: theme.id,
      themeName,
      fieldLabel: field.label,
    }));
    for (const layout of theme.layouts) {
      collectFieldRefs(LAYOUT_FIELDS, layout.attrs, () => ({
        kind: "layout",
        themeId: theme.id,
        themeName,
        layoutId: layout.id,
      }));
    }
  }

  for (const resource of project.resources) {
    const resourceLabel = resource.attrs.name || "未命名资源";
    const definition = RESOURCE_DEFINITION_MAP[resource.type];
    collectFieldRefs(definition.fields, resource.attrs, (field) => ({
      kind: "resource",
      resourceId: resource.id,
      resourceName: resourceLabel,
      resourceType: definition.label,
      fieldLabel: field.label,
    }));
    if (definition.child) {
      resource.children.forEach((child, childIndex) => {
        collectFieldRefs(definition.child!.fields, child.attrs, (field) => ({
          kind: "child",
          resourceId: resource.id,
          resourceName: resourceLabel,
          resourceType: definition.label,
          childIndex,
          fieldLabel: field.label,
        }));
      });
    }
  }

  projectReferencesCache.set(project, index);
  return index;
}

/** 返回项目中对指定资源的显式引用；仅识别格式定义为引用的字段。使用 WeakMap 索引缓存实现 O(1) 查询。 */
export function findResourceReferences(project: WatchfaceProject, target: WatchfaceResource): ResourceReference[] {
  const resourceName = target.attrs.name;
  if (!resourceName) return [];
  const index = getProjectReferencesIndex(project);
  return index.get(resourceName) ?? [];
}
