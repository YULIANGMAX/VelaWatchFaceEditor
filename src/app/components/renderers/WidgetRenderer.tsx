import type { CSSProperties, ReactNode } from "react";
import { measureResource } from "../../core/measure";
import {
  absoluteItemAnchorTransform,
  widgetChildAnchorTransform,
  widgetColumnPositions,
  widgetRowPositions,
  widgetVerticalPosition,
} from "../../core/preview";
import { refName, type WatchfacePreviewContext, type WatchfaceProject, type WatchfaceResource } from "../../core/model";
import { findResource, numberAttr, resourceVisibleInPreview } from "./common";
import { imageNumberDimensions, type WidgetChildDimensions } from "./TextAndNumberRenderer";

interface WidgetRendererProps {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
  depth: number;
  renderResource: (resourceName: string, nextDepth: number) => ReactNode;
}

function WidgetItem({
  project,
  child,
  flex,
  cursorPosition,
  cursorTop,
  preview,
  depth,
  renderResource,
}: {
  project: WatchfaceProject;
  child: WatchfaceResource["children"][number];
  flex: string | undefined;
  cursorPosition?: number;
  cursorTop?: number;
  preview: WatchfacePreviewContext;
  depth: number;
  renderResource: (resourceName: string, nextDepth: number) => ReactNode;
}) {
  const target = findResource(project, refName(child.attrs.ref), preview.color);
  const anchor = target?.attrs.align;
  const width =
    target?.type === "DataItemImageNumber"
      ? imageNumberDimensions(project, target, new Date(), preview).width
      : target
        ? measureResource(project, target, preview.color).width
        : 0;

  const style: CSSProperties =
    cursorPosition !== undefined
      ? {
          position: "absolute",
          left: `${cursorPosition}px`,
          top: `${cursorTop ?? 0}px`,
        }
      : flex
        ? {
            transform: widgetChildAnchorTransform(flex, anchor, width),
          }
        : {
            position: "absolute",
            left: `${Number(child.attrs.x || 0)}px`,
            top: `${Number(child.attrs.y || 0)}px`,
            transform: absoluteItemAnchorTransform(anchor, width),
          };

  return <div style={style}>{renderResource(refName(child.attrs.ref), depth + 1)}</div>;
}

function dynamicChildDimensions(
  project: WatchfaceProject,
  target: WatchfaceResource | undefined,
  now: Date,
  preview: WatchfacePreviewContext,
  visited = new Set<string>(),
): WidgetChildDimensions {
  if (!target) return { width: 0, height: 0 };
  if (target.type === "DataItemImageNumber") {
    return imageNumberDimensions(project, target, now, preview);
  }
  if (target.type === "Widget") {
    const explicitW = Number(target.attrs.w);
    const explicitH = Number(target.attrs.h);
    if (Number.isFinite(explicitW) && explicitW > 0 && Number.isFinite(explicitH) && explicitH > 0) {
      return { width: explicitW, height: explicitH };
    }
    if (visited.has(target.id)) return { width: 0, height: 0 };
    visited.add(target.id);
    const flex = target.attrs.flex_direction;
    const gap = numberAttr(target, "gap");
    const innerChildren = target.children.map((child) => {
      const innerTarget = findResource(project, refName(child.attrs.ref), preview.color);
      return dynamicChildDimensions(project, innerTarget, now, preview, visited);
    });

    if (flex === "row") {
      let totalW = 0;
      let maxH = 0;
      innerChildren.forEach((dim, i) => {
        totalW += dim.width;
        if (i < innerChildren.length - 1) totalW += gap;
        maxH = Math.max(maxH, dim.height);
      });
      return { width: Math.max(0, Math.round(totalW)), height: Math.max(0, Math.round(maxH)) };
    }

    if (flex === "column") {
      let maxW = 0;
      let totalH = 0;
      innerChildren.forEach((dim, i) => {
        maxW = Math.max(maxW, dim.width);
        totalH += dim.height;
        if (i < innerChildren.length - 1) totalH += gap;
      });
      return { width: Math.max(0, Math.round(maxW)), height: Math.max(0, Math.round(totalH)) };
    }

    let maxR = 0;
    let maxB = 0;
    target.children.forEach((child, i) => {
      const cx = Number(child.attrs.x) || 0;
      const cy = Number(child.attrs.y) || 0;
      const dim = innerChildren[i] ?? { width: 0, height: 0 };
      maxR = Math.max(maxR, cx + dim.width);
      maxB = Math.max(maxB, cy + dim.height);
    });
    return { width: Math.max(0, Math.round(maxR)), height: Math.max(0, Math.round(maxB)) };
  }
  return measureResource(project, target, preview.color);
}

export function WidgetRenderer({
  project,
  resource,
  now,
  preview,
  depth,
  renderResource,
}: WidgetRendererProps) {
  const flex = resource.attrs.flex_direction;
  const children = resource.children.map((child) => {
    const target = findResource(project, refName(child.attrs.ref), preview.color);
    const dimensions: WidgetChildDimensions = dynamicChildDimensions(
      project,
      target,
      now,
      preview,
    );
    return { child, target, dimensions };
  });

  // 不可见的数据项不应占用 Widget 自动布局的空间（如摄氏/华氏二选一）。
  const visibleChildren = children.filter(
    ({ target }) => !target || resourceVisibleInPreview(target, now, preview),
  );
  const isRowCursorLayout = flex === "row" && visibleChildren.length > 0;
  const isColumnCursorLayout = flex === "column" && visibleChildren.length > 0;

  const widgetWidth = numberAttr(resource, "w");
  const widgetHeight = numberAttr(resource, "h");
  const gap = numberAttr(resource, "gap");

  const cursorPositions = isRowCursorLayout
    ? widgetRowPositions(
        widgetWidth,
        resource.attrs.justify_content,
        gap,
        visibleChildren.map(({ target, dimensions }) => {
          return {
            align: target?.attrs.align,
            width: dimensions.width,
            unitWidth: target?.type === "DataItemImageNumber" ? dimensions.unitWidth ?? 0 : 0,
          };
        }),
      )
    : undefined;

  const columnPositions = isColumnCursorLayout
    ? widgetColumnPositions(
        widgetWidth,
        widgetHeight,
        resource.attrs.justify_content,
        resource.attrs.align_content,
        resource.attrs.align_items,
        gap,
        visibleChildren.map(({ target, dimensions }) => ({
          align: target?.attrs.align,
          width: dimensions.width,
          height: dimensions.height,
        })),
      )
    : undefined;

  const style: CSSProperties = {
    position: "relative",
    width: resource.attrs.w ? `${widgetWidth}px` : undefined,
    height: resource.attrs.h ? `${widgetHeight}px` : undefined,
    display: isRowCursorLayout || isColumnCursorLayout ? "block" : flex ? "flex" : "block",
    flexDirection: flex === "column" ? "column" : "row",
    justifyContent: resource.attrs.justify_content as CSSProperties["justifyContent"],
    alignItems: resource.attrs.align_items as CSSProperties["alignItems"],
    alignContent: resource.attrs.align_content as CSSProperties["alignContent"],
    gap: resource.attrs.gap ? `${gap}px` : undefined,
  };

  return (
    <div className="widget-resource" style={style}>
      {visibleChildren.map(({ child, dimensions }, index) => (
        <WidgetItem
          key={child.id}
          project={project}
          child={child}
          flex={flex}
          cursorPosition={
            isRowCursorLayout
              ? cursorPositions?.[index]
              : isColumnCursorLayout
                ? columnPositions?.[index]?.x
                : undefined
          }
          cursorTop={
            isRowCursorLayout
              ? widgetVerticalPosition(
                  resource.attrs.align_content,
                  widgetHeight,
                  dimensions.height,
                )
              : isColumnCursorLayout
                ? columnPositions?.[index]?.y
                : undefined
          }
          preview={preview}
          depth={depth}
          renderResource={renderResource}
        />
      ))}
    </div>
  );
}
