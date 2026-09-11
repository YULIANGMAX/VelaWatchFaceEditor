import type { WatchfaceProject } from "../core/model";

export type LayoutAttrPatch = {
  kind: "layout_attrs";
  themeId: string;
  layoutId: string;
  prevAttrs: Record<string, string>;
  nextAttrs: Record<string, string>;
};

export type ResourceAttrPatch = {
  kind: "resource_attrs";
  resourceId: string;
  prevAttrs: Record<string, string>;
  nextAttrs: Record<string, string>;
};

export type ThemeAttrPatch = {
  kind: "theme_attrs";
  themeId: string;
  prevAttrs: Record<string, string>;
  nextAttrs: Record<string, string>;
};

export type ChildAttrPatch = {
  kind: "child_attrs";
  resourceId: string;
  childId: string;
  prevAttrs: Record<string, string>;
  nextAttrs: Record<string, string>;
};

export type FullProjectPatch = {
  kind: "full_project";
  prev: WatchfaceProject;
  next: WatchfaceProject;
};

export type HistoryPatch = LayoutAttrPatch | ResourceAttrPatch | ThemeAttrPatch | ChildAttrPatch | FullProjectPatch;

/**
 * 将 patch 应用到工程对象上
 * @param project 目标工程
 * @param patch 变更补丁
 * @param reverse 是否逆向执行（用于 Undo）
 */
export function applyHistoryPatch(
  project: WatchfaceProject,
  patch: HistoryPatch,
  reverse: boolean,
): WatchfaceProject {
  if (patch.kind === "full_project") {
    return reverse ? patch.prev : patch.next;
  }

  if (patch.kind === "layout_attrs") {
    const theme = project.themes.find((t) => t.id === patch.themeId);
    const layout = theme?.layouts.find((l) => l.id === patch.layoutId);
    if (!layout) return project;

    const targetAttrs = reverse ? patch.prevAttrs : patch.nextAttrs;
    layout.attrs = { ...targetAttrs };
    return { ...project };
  }

  if (patch.kind === "resource_attrs") {
    const resource = project.resources.find((r) => r.id === patch.resourceId);
    if (!resource) return project;

    const targetAttrs = reverse ? patch.prevAttrs : patch.nextAttrs;
    resource.attrs = { ...targetAttrs };
    return { ...project };
  }

  if (patch.kind === "theme_attrs") {
    const theme = project.themes.find((t) => t.id === patch.themeId);
    if (!theme) return project;

    const targetAttrs = reverse ? patch.prevAttrs : patch.nextAttrs;
    theme.attrs = { ...targetAttrs };
    return { ...project };
  }

  if (patch.kind === "child_attrs") {
    const resource = project.resources.find((r) => r.id === patch.resourceId);
    const child = resource?.children.find((c) => c.id === patch.childId);
    if (!child) return project;

    const targetAttrs = reverse ? patch.prevAttrs : patch.nextAttrs;
    child.attrs = { ...targetAttrs };
    return { ...project };
  }

  return project;
}
