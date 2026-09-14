import type { CSSProperties } from "react";
import { metricValue, numericMetric } from "../../core/metrics";
import { measureResource } from "../../core/measure";
import {
  arcPath,
  centeredImageNumberLayout,
  formatImageNumber,
} from "../../core/preview";
import { refName, type WatchfacePreviewContext, type WatchfaceProject, type WatchfaceResource } from "../../core/model";
import {
  ArrayFrame,
  Bitmap,
  findResource,
  imageAsset,
  numberAttr,
  Placeholder,
  recolorFor,
} from "./common";

export interface WidgetChildDimensions {
  width: number;
  height: number;
  unitWidth?: number;
}

export function imageNumberDimensions(
  project: WatchfaceProject,
  resource: WatchfaceResource,
  now: Date,
  preview: WatchfacePreviewContext,
): WidgetChildDimensions {
  const array = findResource(project, refName(resource.attrs.ref), preview.color);
  if (!array || array.type !== "ImageArray") return { width: 0, height: 0, unitWidth: 0 };
  const text = formatImageNumber(
    numericMetric(resource.attrs.source, now, preview.metrics),
    Math.max(1, numberAttr(resource, "totalDigits", 2)),
    numberAttr(resource, "decimalDigits"),
    resource.attrs.leadingZero === "true",
    resource.attrs.trailingZero === "true",
  );
  const space = numberAttr(resource, "space");
  const decimalOffset = numberAttr(resource, "decimalOffsetX");
  let digitsWidth = 0;
  let digitsHeight = 0;
  Array.from(text).forEach((token) => {
    const frameIndex = token === "-" ? 10 : token === "." ? 11 : Number(token);
    const asset = imageAsset(project, array.children[frameIndex]?.attrs.src);
    digitsWidth += (asset?.width || 0) + space;
    digitsHeight = Math.max(digitsHeight, asset?.height || 0);
  });
  if (text.length > 0) digitsWidth -= space;
  if (text.includes(".") && decimalOffset !== 0) digitsWidth += decimalOffset;
  const unit = resource.attrs.unitIcon ? findResource(project, refName(resource.attrs.unitIcon), preview.color) : undefined;
  const unitDimension = unit ? measureResource(project, unit, preview.color) : { width: 0, height: 0 };
  return {
    width: digitsWidth + (unitDimension.width > 0 && digitsWidth > 0 ? space : 0) + unitDimension.width,
    height: Math.max(digitsHeight, unitDimension.height),
    unitWidth: unitDimension.width,
  };
}

function textContent(resource: WatchfaceResource, now: Date, preview: WatchfacePreviewContext): string {
  const sources = resource.children.length
    ? resource.children.map((child) => metricValue(child.attrs.source, now, preview.metrics))
    : [metricValue(resource.attrs.source, now, preview.metrics)];
  let content = resource.attrs.string || "%d";
  sources.forEach((value) => {
    content = content.replace(/%[ds]/, String(value));
  });
  return content;
}

function textWeight(value: string | undefined): CSSProperties["fontWeight"] {
  if (["bold", "heavy"].includes(value ?? "")) return 700;
  if (["demibold", "semibold"].includes(value ?? "")) return 600;
  if (["light", "extralight", "thin"].includes(value ?? "")) return 300;
  return 400;
}

export function TextView({
  resource,
  now,
  preview,
}: {
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
}) {
  const content = textContent(resource, now, preview);
  const fontSize = numberAttr(resource, "fontSize", 20);
  const common: CSSProperties = {
    color: resource.attrs.color || "#ffffff",
    opacity: numberAttr(resource, "opacity", 100) / 100,
    fontSize: `${fontSize}px`,
    fontWeight: textWeight(resource.attrs.fontWeight),
    letterSpacing: `${numberAttr(resource, "letterSpace")}px`,
    fontFamily: resource.attrs.fontId || "sans-serif",
  };

  if (resource.attrs.style === "arc") {
    const radius = Math.max(1, numberAttr(resource, "radius", 50));
    const padding = fontSize * 1.5;
    const size = (radius + padding) * 2;
    const pathId = `text-path-${resource.id}`;
    return (
      <svg
        className="arc-text-resource"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible", opacity: common.opacity }}
      >
        <defs>
          <path
            id={pathId}
            d={arcPath(size / 2, size / 2, radius, numberAttr(resource, "startAngle"), numberAttr(resource, "span", 180))}
          />
        </defs>
        <text
          fill={String(common.color)}
          fontSize={fontSize}
          fontWeight={common.fontWeight}
          letterSpacing={numberAttr(resource, "letterSpace")}
          fontFamily={String(common.fontFamily)}
        >
          <textPath href={`#${pathId}`}>{content}</textPath>
        </text>
      </svg>
    );
  }

  const longMode = resource.attrs.longMode || "dots";
  return (
    <div
      className={`text-resource long-mode-${longMode}`}
      style={{
        ...common,
        width: `${numberAttr(resource, "w", 80)}px`,
        height: `${numberAttr(resource, "h", 30)}px`,
        lineHeight: `${fontSize + numberAttr(resource, "lineSpace")}px`,
        textAlign: resource.attrs.align === "right" ? "right" : resource.attrs.align === "center" ? "center" : "left",
        whiteSpace: longMode === "wrap" ? "normal" : "nowrap",
        overflow: "hidden",
        textOverflow: longMode === "dots" ? "ellipsis" : "clip",
      }}
    >
      {content}
    </div>
  );
}

export function ImageNumberView({
  project,
  resource,
  now,
  preview,
  renderResource,
}: {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
  renderResource: (resourceName: string) => React.ReactNode;
}) {
  const array = findResource(project, refName(resource.attrs.ref), preview.color);
  if (!array || array.type !== "ImageArray") return <Placeholder label="数字序列未设置" />;
  const decimalDigits = numberAttr(resource, "decimalDigits");
  const totalDigits = Math.max(1, numberAttr(resource, "totalDigits", 2));
  const text = formatImageNumber(
    numericMetric(resource.attrs.source, now, preview.metrics),
    totalDigits,
    decimalDigits,
    resource.attrs.leadingZero === "true",
    resource.attrs.trailingZero === "true",
  );
  const space = numberAttr(resource, "space");
  const decimalOffset = numberAttr(resource, "decimalOffsetX");

  let maxCharWidth = 0;
  for (const child of array.children) {
    const asset = imageAsset(project, child?.attrs.src);
    if (asset) {
      maxCharWidth = Math.max(maxCharWidth, asset.width || 0);
    }
  }

  let digitsWidth = 0;
  Array.from(text).forEach((token) => {
    const frameIndex = token === "-" ? 10 : token === "." ? 11 : Number(token);
    const frame = array.children[frameIndex];
    const asset = imageAsset(project, frame?.attrs.src);
    digitsWidth += (asset?.width || maxCharWidth) + space;
  });
  if (text.length > 0) digitsWidth -= space;
  if (text.includes(".") && decimalOffset !== 0) digitsWidth += decimalOffset;

  const align = resource.attrs.align;
  const centeredLayout = centeredImageNumberLayout(
    totalDigits,
    maxCharWidth,
    space,
    decimalDigits,
    decimalOffset,
    digitsWidth,
  );

  if (align === "center") {
    return (
      <div
        className="image-number image-number--center"
        style={{
          width: `${centeredLayout.componentWidth}px`,
          position: "relative",
          display: "inline-flex",
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <div
          className="image-number-digits"
          style={{
            marginLeft: `${centeredLayout.numberMarginLeft}px`,
            display: "inline-flex",
            alignItems: "flex-end",
            gap: `${space}px`,
          }}
        >
          {Array.from(text).map((token, index) => {
            const frameIndex = token === "-" ? 10 : token === "." ? 11 : Number(token);
            const frame = array.children[frameIndex];
            const asset = imageAsset(project, frame?.attrs.src);
            const style: CSSProperties | undefined =
              token === "." && decimalOffset !== 0 ? { marginLeft: `${decimalOffset}px` } : undefined;
            return asset ? (
              <span key={`${token}-${index}`} style={style}>
                <Bitmap
                  asset={asset}
                  color={resource.attrs.supportRecolor === "true" ? recolorFor(project, array, preview) : undefined}
                />
              </span>
            ) : (
              <span className="number-fallback" key={`${token}-${index}`} style={style}>
                {token}
              </span>
            );
          })}
        </div>
        {resource.attrs.unitIcon ? (
          <div
            style={{
              position: "absolute",
              left: `${centeredLayout.unitOffset}px`,
              bottom: 0,
              width: "max-content",
              display: "inline-flex",
            }}
          >
            {renderResource(refName(resource.attrs.unitIcon))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="image-number image-number--natural"
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap: `${space}px`,
        flexShrink: 0,
      }}
    >
      {Array.from(text).map((token, index) => {
        const frameIndex = token === "-" ? 10 : token === "." ? 11 : Number(token);
        const frame = array.children[frameIndex];
        const asset = imageAsset(project, frame?.attrs.src);
        const style: CSSProperties | undefined =
          token === "." && decimalOffset !== 0 ? { marginLeft: `${decimalOffset}px` } : undefined;
        return asset ? (
          <span key={`${token}-${index}`} style={style}>
            <Bitmap asset={asset} color={resource.attrs.supportRecolor === "true" ? recolorFor(project, array, preview) : undefined} />
          </span>
        ) : (
          <span className="number-fallback" key={`${token}-${index}`} style={style}>
            {token}
          </span>
        );
      })}
      {resource.attrs.unitIcon ? renderResource(refName(resource.attrs.unitIcon)) : null}
    </div>
  );
}

export function ImageValuesView({
  project,
  resource,
  now,
  preview,
}: {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  now: Date;
  preview: WatchfacePreviewContext;
}) {
  const array = findResource(project, refName(resource.attrs.ref), preview.color);
  if (!array || array.type !== "ImageArray") return <Placeholder label="图片序列未设置" />;
  const value = numericMetric(resource.attrs.source, now, preview.metrics);
  let index = 0;
  resource.children.forEach((child, childIndex) => {
    const threshold = Number(child.attrs.value);
    if (Number.isFinite(threshold) && value >= threshold) index = childIndex;
  });
  return <ArrayFrame project={project} resource={array} index={index} preview={preview} ignoreRecolor={resource.attrs.supportRecolor !== "true"} />;
}
