import type { ReactNode } from "react";
import { spriteFrameIndex } from "../core/preview";
import {
  refName,
  type WatchfacePreviewContext,
  type WatchfaceProject,
} from "../core/model";
import {
  ArrayFrame,
  findResource,
  ImageView,
  numberAttr,
  Placeholder,
  resourceVisibleInPreview,
} from "./renderers/common";
import { PointerRenderer } from "./renderers/PointerRenderer";
import { ProgressRenderer } from "./renderers/ProgressRenderer";
import {
  ImageNumberView,
  ImageValuesView,
  TextView,
} from "./renderers/TextAndNumberRenderer";
import { WidgetRenderer } from "./renderers/WidgetRenderer";

export { resourceVisibleInPreview } from "./renderers/common";

export interface ResourceRendererProps {
  project: WatchfaceProject;
  resourceName: string;
  now: Date;
  preview?: WatchfacePreviewContext;
  depth?: number;
  frameIndex?: number;
}

export function ResourceRenderer({
  project,
  resourceName,
  now,
  preview = { color: "", elapsedMs: 0, temperatureUnit: "celsius", metrics: {} },
  depth = 0,
  frameIndex,
}: ResourceRendererProps): ReactNode {
  if (depth > 8) return <Placeholder label="嵌套过深" />;
  const resource = findResource(project, resourceName, preview.color);
  if (!resource) return <Placeholder label={`@${resourceName}`} />;
  if (!resourceVisibleInPreview(resource, now, preview)) return null;

  let content: ReactNode;

  switch (resource.type) {
    case "Image":
      content = <ImageView project={project} resource={resource} preview={preview} />;
      break;

    case "ImageArray":
      content = (
        <ArrayFrame
          project={project}
          resource={resource}
          index={frameIndex ?? 0}
          preview={preview}
        />
      );
      break;

    case "Sprite": {
      const array = findResource(project, refName(resource.attrs.ref), preview.color);
      if (!array || array.type !== "ImageArray") return <Placeholder label="动画序列未设置" />;
      content = (
        <ArrayFrame
          project={project}
          resource={array}
          index={
            frameIndex ??
            spriteFrameIndex(
              preview.elapsedMs,
              numberAttr(resource, "interval", 80),
              array.children.length,
              numberAttr(resource, "repeatCount"),
            )
          }
          preview={preview}
        />
      );
      break;
    }

    case "DataItemImageNumber":
      content = (
        <ImageNumberView
          project={project}
          resource={resource}
          now={now}
          preview={preview}
          renderResource={(unitName) => (
            <ResourceRenderer
              project={project}
              resourceName={unitName}
              now={now}
              preview={preview}
              depth={1}
            />
          )}
        />
      );
      break;

    case "DataItemImageValues":
      content = (
        <ImageValuesView
          project={project}
          resource={resource}
          now={now}
          preview={preview}
        />
      );
      break;

    case "DataItemText":
      content = <TextView resource={resource} now={now} preview={preview} />;
      break;

    case "DataItemPointer":
      content = (
        <PointerRenderer
          project={project}
          resource={resource}
          now={now}
          preview={preview}
        />
      );
      break;

    case "DataItemArcProgressBar":
      content = (
        <ProgressRenderer
          project={project}
          resource={resource}
          now={now}
          preview={preview}
          arc
        />
      );
      break;

    case "DataItemLineProgressBar":
      content = (
        <ProgressRenderer
          project={project}
          resource={resource}
          now={now}
          preview={preview}
          arc={false}
        />
      );
      break;

    case "Widget":
      content = (
        <WidgetRenderer
          project={project}
          resource={resource}
          now={now}
          preview={preview}
          depth={depth}
          renderResource={(childName, nextDepth) => (
            <ResourceRenderer
              project={project}
              resourceName={childName}
              now={now}
              preview={preview}
              depth={nextDepth}
            />
          )}
        />
      );
      break;

    case "Slot": {
      const first = resource.children[0];
      content = first ? (
        <ResourceRenderer
          project={project}
          resourceName={refName(first.attrs.ref)}
          now={now}
          preview={preview}
          depth={depth + 1}
        />
      ) : (
        <Placeholder
          label={
            resource.attrs.appWidgetID ||
            (resource.attrs.type === "dualTime" ? "双时区组件（设备预览）" : "空槽位")
          }
        />
      );
      break;
    }

    case "Translation":
      content = (
        <Placeholder
          label={
            resource.children.find((child) => child.attrs.language === "zh_CN")?.attrs.str ||
            resourceName
          }
        />
      );
      break;

    case "File":
      content = <Placeholder label="文件资源" />;
      break;
  }

  if (!resource.type.startsWith("DataItem") || !numberAttr(resource, "rotation")) {
    return content;
  }

  const origin =
    resource.attrs.align === "right" ? "100% 0" : resource.attrs.align === "center" ? "50% 0" : "0 0";

  return (
    <div
      className="data-item-rotation"
      style={{
        transform: `rotate(${numberAttr(resource, "rotation")}deg)`,
        transformOrigin: origin,
      }}
    >
      {content}
    </div>
  );
}
