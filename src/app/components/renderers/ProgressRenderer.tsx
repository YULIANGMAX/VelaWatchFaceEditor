import { numericMetric } from "../../core/metrics";
import {
  arcProgressClipAngles,
  arcPath,
  clampProgress,
  linePoint,
  polarPoint,
} from "../../core/preview";
import { refName, type WatchfacePreviewContext, type WatchfaceProject, type WatchfaceResource } from "../../core/model";
import { Bitmap, findResource, imageAsset, numberAttr, Placeholder } from "./common";

interface ProgressRendererProps {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
  arc: boolean;
}

export function ProgressRenderer({ project, resource, now, preview, arc }: ProgressRendererProps) {
  const image = findResource(project, refName(resource.attrs.ref), preview.color);
  if (!image || image.type !== "Image") return <Placeholder label="进度图片未设置" />;
  const asset = imageAsset(project, image.attrs.src);
  if (!asset) return <Placeholder label={image.attrs.src || "缺少进度图片"} />;

  const start = resource.attrs.valueStartSource
    ? numericMetric(resource.attrs.valueStartSource, now, preview.metrics)
    : numberAttr(resource, "valueStart");
  const range = resource.attrs.valueRangeSource
    ? numericMetric(resource.attrs.valueRangeSource, now, preview.metrics)
    : numberAttr(resource, "valueRange", 100);
  const progress = clampProgress(numericMetric(resource.attrs.source, now, preview.metrics), start, range);

  const width =
    asset.width ??
    Math.max(
      1,
      arc
        ? numberAttr(resource, "pivotX") + numberAttr(resource, "barRadius") + numberAttr(resource, "barWidth")
        : numberAttr(resource, "endX") + numberAttr(resource, "barWidth"),
    );
  const height =
    asset.height ??
    Math.max(
      1,
      arc
        ? numberAttr(resource, "pivotY") + numberAttr(resource, "barRadius") + numberAttr(resource, "barWidth")
        : Math.max(numberAttr(resource, "startY"), numberAttr(resource, "endY")) + numberAttr(resource, "barWidth"),
    );

  const maskId = `progress-mask-${resource.id}`;
  const indicator = resource.attrs.indicatorImage
    ? findResource(project, refName(resource.attrs.indicatorImage), preview.color)
    : undefined;
  const indicatorAsset = indicator?.type === "Image" ? imageAsset(project, indicator.attrs.src) : undefined;
  const indicatorWidth = indicatorAsset?.width ?? 16;
  const indicatorHeight = indicatorAsset?.height ?? 16;
  const strokeLinecap = resource.attrs.endingStyle === "round" ? "round" : "butt";

  let path = "";
  let point = { x: 0, y: 0 };
  const background = resource.attrs.bg ? findResource(project, refName(resource.attrs.bg), preview.color) : undefined;
  const backgroundAsset = background?.type === "Image" ? imageAsset(project, background.attrs.src) : undefined;

  if (arc) {
    const clipAngles = arcProgressClipAngles(
      numberAttr(resource, "angleStart"),
      numberAttr(resource, "angleRange", 360),
      Boolean(backgroundAsset),
    );
    const angle = clipAngles.angleRange * progress;
    path = arcPath(
      numberAttr(resource, "pivotX"),
      numberAttr(resource, "pivotY"),
      numberAttr(resource, "barRadius"),
      clipAngles.startAngle,
      angle,
    );
    point = polarPoint(
      numberAttr(resource, "pivotX"),
      numberAttr(resource, "pivotY"),
      numberAttr(resource, "indicatorRadius", numberAttr(resource, "barRadius")),
      clipAngles.startAngle + angle,
    );
  } else {
    const startX = numberAttr(resource, "startX");
    const startY = numberAttr(resource, "startY");
    point = linePoint(startX, startY, numberAttr(resource, "endX"), numberAttr(resource, "endY"), progress);
    path = `M ${startX} ${startY} L ${point.x} ${point.y}`;
    point = { x: point.x + numberAttr(resource, "offsetX"), y: point.y + numberAttr(resource, "offsetY") };
  }

  return (
    <div className="progress-resource" style={{ width, height }}>
      {backgroundAsset ? <Bitmap asset={backgroundAsset} /> : null}
      <svg className="progress-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="#000" />
            <path
              d={path}
              fill="none"
              stroke="#fff"
              strokeWidth={Math.max(0, numberAttr(resource, "barWidth"))}
              strokeLinecap={strokeLinecap}
            />
          </mask>
        </defs>
        <image href={asset.url} width={width} height={height} mask={`url(#${maskId})`} />
        {indicatorAsset && progress > 0 ? (
          <image
            href={indicatorAsset.url}
            x={point.x - indicatorWidth / 2}
            y={point.y - indicatorHeight / 2}
            width={indicatorWidth}
            height={indicatorHeight}
          />
        ) : null}
      </svg>
    </div>
  );
}
