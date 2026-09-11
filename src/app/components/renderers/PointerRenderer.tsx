import { numericMetric } from "../../core/metrics";
import { clampProgress } from "../../core/preview";
import { refName, type WatchfacePreviewContext, type WatchfaceProject, type WatchfaceResource } from "../../core/model";
import { findResource, ImageView, numberAttr, Placeholder } from "./common";

interface PointerRendererProps {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
}

export function PointerRenderer({ project, resource, now, preview }: PointerRendererProps) {
  const image = findResource(project, refName(resource.attrs.ref), preview.color);
  if (!image || image.type !== "Image") return <Placeholder label="指针图片未设置" />;
  const progress = clampProgress(
    numericMetric(resource.attrs.source, now, preview.metrics),
    numberAttr(resource, "valueStart"),
    numberAttr(resource, "valueRange", 60),
  );
  const angle = numberAttr(resource, "angleStart") + progress * numberAttr(resource, "angleRange", 360);
  return (
    <div
      className="pointer-resource"
      style={{
        transform: `rotate(${angle}deg)`,
        transformOrigin: `${numberAttr(resource, "pivotX")}px ${numberAttr(resource, "pivotY")}px`,
      }}
    >
      <ImageView project={project} resource={image} preview={preview} />
    </div>
  );
}
