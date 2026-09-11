import type { CSSProperties, ReactNode } from "react";
import { measureResource } from "../../core/measure";
import {
  absoluteItemAnchorTransform,
  widgetChildAnchorTransform,
  widgetRowPositions,
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

function widgetVerticalPosition(
  align: string | undefined,
  widgetHeight: number,
  itemHeight: number,
): number {
  if (align === "center") return (widgetHeight - itemHeight) / 2;
  if (align === "flex-end") return widgetHeight - itemHeight;
  return 0;
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
    const dimensions: WidgetChildDimensions =
      target?.type === "DataItemImageNumber"
        ? imageNumberDimensions(project, target, now, preview)
        : target
          ? measureResource(project, target, preview.color)
          : { width: 0, height: 0 };
    return { child, target, dimensions };
  });

  // 不可见的数据项不应占用 Widget 自动布局的空间（如摄氏/华氏二选一）。
  const visibleChildren = children.filter(
    ({ target }) => !target || resourceVisibleInPreview(target, now, preview),
  );
  const isRowCursorLayout = flex === "row" && visibleChildren.length > 0;
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

  const style: CSSProperties = {
    position: "relative",
    width: resource.attrs.w ? `${widgetWidth}px` : undefined,
    height: resource.attrs.h ? `${widgetHeight}px` : undefined,
    display: isRowCursorLayout ? "block" : flex ? "flex" : "block",
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
          cursorPosition={cursorPositions?.[index]}
          cursorTop={
            cursorPositions
              ? widgetVerticalPosition(resource.attrs.align_items, widgetHeight, dimensions.height)
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
