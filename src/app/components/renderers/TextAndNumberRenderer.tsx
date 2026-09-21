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
  const arrayDim = measureResource(project, array, preview.color);
  const fallbackCharWidth = arrayDim.width > 0 ? arrayDim.width : 20;
  const fallbackCharHeight = arrayDim.height > 0 ? arrayDim.height : 26;
  let digitsWidth = 0;
  let digitsHeight = 0;
  Array.from(text).forEach((token) => {
    const frameIndex = token === "-" ? 10 : token === "." ? 11 : Number(token);
    const asset = imageAsset(project, array.children[frameIndex]?.attrs.src);
    digitsWidth += (asset?.width || fallbackCharWidth) + space;
    digitsHeight = Math.max(digitsHeight, asset?.height || fallbackCharHeight);
  });
  if (text.length > 0) digitsWidth -= space;
  if (text.includes(".") && decimalOffset !== 0) digitsWidth += decimalOffset;
  digitsWidth = Math.max(0, digitsWidth);
  const unit = resource.attrs.unitIcon ? findResource(project, refName(resource.attrs.unitIcon), preview.color) : undefined;
  const unitDimension = unit ? measureResource(project, unit, preview.color) : { width: 0, height: 0 };
  return {
    width: Math.max(0, Math.round(digitsWidth + (unitDimension.width > 0 && digitsWidth > 0 ? space : 0) + unitDimension.width)),
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

function getFontFamily(fontId?: string): string {
  switch (fontId) {
    case "misanslatin":
      return "'MiSansLatin VF', misanslatin, 'MiSans VF', sans-serif";
    case "misansw":
    case "misans":
      return "'MiSans VF', misans, 'MiSansLatin VF', sans-serif";
    case "misanstc":
      return "'MiSansTC VF', misanstc, 'MiSans VF', sans-serif";
    case "notosans":
      return "'Noto Sans', notosans, 'MiSans VF', sans-serif";
    default:
      return "'MiSansLatin VF', 'MiSans VF', misans, sans-serif";
  }
}

let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function measureCharWidth(char: string, fontSize: number, fontWeight: string | number, fontFamily: string): number {
  if (typeof document !== "undefined") {
    try {
      if (!measureCanvas) {
        measureCanvas = document.createElement("canvas");
        measureCtx = measureCanvas.getContext("2d");
      }
      if (measureCtx) {
        measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        const measured = measureCtx.measureText(char).width;
        if (measured > 0) return measured;
      }
    } catch {
      // 容错回退
    }
  }
  // 启发式字符宽度（以字号比例估算）
  if (char === ".") return fontSize * 0.22;
  if (char === ":" || char === "!" || char === "|" || char === "'") return fontSize * 0.22;
  if (char === " " || char === "i" || char === "l" || char === "1") return fontSize * 0.32;
  if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) return fontSize * 1.0;
  if (/[0-9]/.test(char)) return fontSize * 0.58;
  if (/[M|W]/.test(char)) return fontSize * 0.8;
  if (/[I|J|L|T]/.test(char)) return fontSize * 0.56;
  if (/[A-Z]/.test(char)) return fontSize * 0.62;
  return fontSize * 0.52;
}

export function truncateWithDots(
  text: string,
  maxWidth: number,
  fontSize: number,
  letterSpace: number,
  fontWeight: string | number,
  fontFamily: string,
): string {
  if (!text || maxWidth <= 0) return text;

  // 1. 测算各字符宽度（字符字形 + letterSpace）
  const charWidths: number[] = new Array(text.length);
  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    const cw = measureCharWidth(text[i], fontSize, fontWeight, fontFamily) + letterSpace;
    charWidths[i] = cw;
    totalWidth += cw;
  }

  // 若无溢出，原样返回
  if (totalWidth <= maxWidth) return text;

  // 2. 溢出截断：真机采用 3 个独立 ASCII 点字符 '.' 截断，各点独立施加 letterSpace
  const dotWidth = measureCharWidth(".", fontSize, fontWeight, fontFamily) + letterSpace;
  const dotsTotalWidth = dotWidth * 3;

  let currentWidth = 0;
  let fittedLength = 0;
  for (let i = 0; i < text.length; i++) {
    if (currentWidth + charWidths[i] + dotsTotalWidth <= maxWidth) {
      currentWidth += charWidths[i];
      fittedLength = i + 1;
    } else {
      break;
    }
  }

  return text.slice(0, fittedLength) + "...";
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
    fontFamily: getFontFamily(resource.attrs.fontId),
  };

  if (resource.attrs.style === "arc") {
    const radius = Math.max(1, numberAttr(resource, "radius", 50));
    const padding = fontSize * 1.5;
    const size = (radius + padding) * 2;
    const vAlign = resource.attrs.verticalAlign;
    const pathId = `text-path-${resource.id}`;
    const span = numberAttr(resource, "span", 180);
    const letterSpace = numberAttr(resource, "letterSpace", 0);

    // 计算文字实际物理基线轨道的真实同心圆几何半径，彻底避免 dominant-baseline 畸变
    let trackRadius = radius;
    if (vAlign === "bottom") {
      trackRadius = Math.max(1, radius - fontSize);
    } else if (vAlign === "center") {
      trackRadius = Math.max(1, radius - fontSize / 2);
    }

    const arcLength = (Math.abs(span) / 180) * Math.PI * trackRadius;
    const safetyMargin = vAlign === "bottom" ? fontSize * 0.75 : fontSize * 0.45;
    const maxAvailableWidth = Math.max(0, arcLength - safetyMargin);

    const longMode = resource.attrs.longMode || "dots";
    const arcContent =
      longMode === "dots"
        ? truncateWithDots(content, maxAvailableWidth, fontSize, letterSpace, common.fontWeight ?? 400, String(common.fontFamily))
        : content;

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
            d={arcPath(size / 2, size / 2, trackRadius, numberAttr(resource, "startAngle"), span)}
          />
        </defs>
        <text
          fill={String(common.color)}
          fontSize={fontSize}
          fontWeight={common.fontWeight}
          letterSpacing={numberAttr(resource, "letterSpace")}
          fontFamily={String(common.fontFamily)}
        >
          <textPath href={`#${pathId}`}>{arcContent}</textPath>
        </text>
      </svg>
    );
  }

  const longMode = resource.attrs.longMode || "dots";
  const lineSpace = Math.max(0, numberAttr(resource, "lineSpace", 0));
  const baseLineHeight = Math.round(fontSize * 1.38);
  const computedLineHeight = longMode === "wrap" ? baseLineHeight + lineSpace : fontSize;
  const halfLeadingOffset = longMode === "wrap" ? Math.round(lineSpace / 2) : 0;
  const w = numberAttr(resource, "w", 80);
  const h = numberAttr(resource, "h", 30);
  const letterSpace = numberAttr(resource, "letterSpace", 0);

  // longMode === "dots" 时采用真机独立 3 点排版，每个点享有完全相同的 letterSpace
  const displayContent =
    longMode === "dots"
      ? truncateWithDots(content, w, fontSize, letterSpace, common.fontWeight ?? 400, String(common.fontFamily))
      : content;

  return (
    <div
      className={`text-resource long-mode-${longMode}`}
      style={{
        ...common,
        width: `${w}px`,
        height: `${h}px`,
        lineHeight: `${computedLineHeight}px`,
        textAlign: resource.attrs.align === "right" ? "right" : resource.attrs.align === "center" ? "center" : "left",
        whiteSpace: longMode === "wrap" ? "normal" : "nowrap",
        overflow: "hidden",
        textOverflow: longMode === "clip" ? "clip" : undefined,
      }}
    >
      {longMode === "wrap" ? (
        <div style={{ marginTop: halfLeadingOffset > 0 ? `${-halfLeadingOffset}px` : undefined }}>
          {displayContent}
        </div>
      ) : (
        displayContent
      )}
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
