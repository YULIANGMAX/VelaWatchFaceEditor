import type { WatchfaceProject } from "./model";

export type DiagnosticTarget =
  | { kind: "project" }
  | { kind: "theme"; themeId: string }
  | { kind: "layout"; themeId: string; layoutId: string }
  | { kind: "resource"; resourceId: string };

/** 根据诊断位置解析编辑器内可选中的目标；不能细分的项目级诊断回退到项目属性。 */
export function findDiagnosticTarget(project: WatchfaceProject, location: string): DiagnosticTarget {
  if (!location) return { kind: "project" };
  const cleanLoc = location.trim().replace(/^\/+/, "");

  // 1. 匹配 Resources 下的图元，例如 Resources/DataItemImageValues[@name='ImageValues1'] 或带 /Param[1]
  const resourceMatch = cleanLoc.match(/^Resources\/([a-zA-Z0-9_]+)(?:\[@name=['"]?(.*?)['"]?\])?/);
  if (resourceMatch) {
    const [, type, name] = resourceMatch;
    // 1.1 精准匹配类型与名称
    if (name && name !== "?" && name !== "未命名") {
      const exact = project.resources.find(
        (entry) => entry.type === type && (entry.attrs.name ?? "") === name,
      );
      if (exact) return { kind: "resource", resourceId: exact.id };

      // 忽略大小写匹配名称
      const caseMatch = project.resources.find(
        (entry) => entry.type.toLowerCase() === type.toLowerCase() && (entry.attrs.name ?? "").toLowerCase() === name.toLowerCase(),
      );
      if (caseMatch) return { kind: "resource", resourceId: caseMatch.id };

      // 仅根据名称匹配（避免类型别名导致失配）
      const nameMatch = project.resources.find((entry) => (entry.attrs.name ?? "") === name);
      if (nameMatch) return { kind: "resource", resourceId: nameMatch.id };
    }

    // 1.2 无名资源或占位名（如 '?' 或未命名）或无 @name 声明：回退到同类型首个无名资源，或同类型首个资源
    const unnamedResource = project.resources.find(
      (entry) => entry.type === type && !(entry.attrs.name ?? "").trim(),
    );
    if (unnamedResource) return { kind: "resource", resourceId: unnamedResource.id };

    const firstTypeResource = project.resources.find((entry) => entry.type === type);
    if (firstTypeResource) return { kind: "resource", resourceId: firstTypeResource.id };
  }

  // 2. 匹配 Theme 与 Layout，例如 Theme[@name='样式1']/Layout[2] 或 Theme[@name='normal']
  const themeMatch = cleanLoc.match(/^Theme(?:\[@name=['"]?(.*?)['"]?\])?/);
  if (themeMatch) {
    const [, name] = themeMatch;
    let theme = name && name !== "?"
      ? project.themes.find((entry) => (entry.attrs.name || entry.attrs.type || "?") === name)
      : undefined;
    if (!theme) {
      theme = project.themes[0];
    }
    if (theme) {
      const layoutMatch = cleanLoc.match(/\/Layout(?:\[(\d+)\]|\[@ref=['"]?(.*?)['"]?\])?/);
      if (layoutMatch) {
        const [, indexStr, refStr] = layoutMatch;
        if (indexStr) {
          const layoutIndex = Number(indexStr) - 1;
          const layout = theme.layouts[layoutIndex];
          if (layout) return { kind: "layout", themeId: theme.id, layoutId: layout.id };
        } else if (refStr) {
          const layout = theme.layouts.find((l) => l.attrs.ref === refStr || l.attrs.ref === `@${refStr}`);
          if (layout) return { kind: "layout", themeId: theme.id, layoutId: layout.id };
        }
      }
      return { kind: "theme", themeId: theme.id };
    }
  }

  // 3. 匹配独立布局诊断，例如 Layout[2]
  const directLayoutMatch = cleanLoc.match(/^Layout\[(\d+)\]/);
  if (directLayoutMatch && project.themes[0]) {
    const layoutIndex = Number(directLayoutMatch[1]) - 1;
    const layout = project.themes[0].layouts[layoutIndex];
    if (layout) return { kind: "layout", themeId: project.themes[0].id, layoutId: layout.id };
  }

  return { kind: "project" };
}
