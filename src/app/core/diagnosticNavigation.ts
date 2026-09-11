import type { WatchfaceProject } from "./model";

export type DiagnosticTarget =
  | { kind: "project" }
  | { kind: "theme"; themeId: string }
  | { kind: "layout"; themeId: string; layoutId: string }
  | { kind: "resource"; resourceId: string };

/** 根据诊断位置解析编辑器内可选中的目标；不能细分的项目级诊断回退到项目属性。 */
export function findDiagnosticTarget(project: WatchfaceProject, location: string): DiagnosticTarget {
  const resourceMatch = location.match(/^Resources\/([^[]+)\[@name='(.*?)'\]/);
  if (resourceMatch) {
    const [, type, name] = resourceMatch;
    const resource = project.resources.find((entry) => entry.type === type && (entry.attrs.name ?? "") === name);
    if (resource) return { kind: "resource", resourceId: resource.id };
  }

  const themeMatch = location.match(/^Theme\[@name='(.*?)'\]/);
  if (themeMatch) {
    const [, name] = themeMatch;
    const theme = project.themes.find((entry) => (entry.attrs.name || entry.attrs.type || "?") === name);
    if (theme) {
      const layoutMatch = location.match(/\/Layout\[(\d+)\]/);
      const layoutIndex = layoutMatch ? Number(layoutMatch[1]) - 1 : -1;
      const layout = layoutIndex >= 0 ? theme.layouts[layoutIndex] : undefined;
      return layout
        ? { kind: "layout", themeId: theme.id, layoutId: layout.id }
        : { kind: "theme", themeId: theme.id };
    }
  }

  return { kind: "project" };
}
