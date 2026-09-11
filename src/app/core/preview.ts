export interface Point {
  x: number;
  y: number;
}

export interface CenteredImageNumberLayout {
  slotDigitsWidth: number;
  componentWidth: number;
  numberMarginLeft: number;
  unitOffset: number;
}

export interface WidgetRowItem {
  align: string | undefined;
  width: number;
  unitWidth: number;
}

export function widgetRowPositions(
  widgetWidth: number,
  justifyContent: string | undefined,
  gap: number,
  items: WidgetRowItem[],
): number[] {
  if (items.length === 0) return [];
  const flowWidths = items.map((item) => item.align === "center"
    ? item.width - item.unitWidth
    : item.width);
  const allCentered = items.length > 1
    && items.every((item) => item.align === "center")
    && items.every((item) => item.width === items[0].width);
  const totalWidth = allCentered
    ? Math.max(...items.map((item) => item.width))
    : flowWidths.reduce((total, width) => total + width, 0) + Math.max(0, items.length - 1) * gap;
  let cursor = justifyContent === "center" ? (widgetWidth - totalWidth) / 2 : 0;
  return items.map((item) => {
    if (item.align === "center") cursor -= item.width / 2;
    else if (item.align === "right") cursor -= item.width;
    const position = cursor;
    cursor += item.width + gap;
    return position;
  });
}

export function widgetChildAnchorTransform(
  flex: string | undefined,
  align: string | undefined,
  width: number,
): string | undefined {
  if (flex !== "row" && flex !== "column") return undefined;
  if (align === "center") return `translateX(-${width / 2}px)`;
  if (flex === "row" && align === "right") return `translateX(-${width}px)`;
  return undefined;
}

export function absoluteItemAnchorTransform(
  align: string | undefined,
  width: number,
): string | undefined {
  if (align === "center") return `translateX(-${width / 2}px)`;
  if (align === "right") return `translateX(-${width}px)`;
  return undefined;
}

export function centeredImageNumberLayout(
  totalDigits: number,
  maxCharWidth: number,
  space: number,
  decimalDigits: number,
  decimalOffset: number,
  digitsWidth: number,
): CenteredImageNumberLayout {
  const slotDigitsWidth = totalDigits * maxCharWidth
    + Math.max(0, totalDigits - 1) * space
    + (decimalDigits > 0 ? decimalOffset : 0);
  const unitGap = digitsWidth > 0 ? space : 0;
  return {
    slotDigitsWidth,
    componentWidth: digitsWidth,
    numberMarginLeft: 0,
    unitOffset: digitsWidth + unitGap,
  };
}

export function clampProgress(value: number, start: number, range: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(start) || !Number.isFinite(range) || range === 0) return 0;
  return Math.min(1, Math.max(0, (value - start) / range));
}

export function spriteFrameIndex(elapsedMs: number, interval: number, frameCount: number, repeatCount: number): number {
  if (frameCount <= 0) return 0;
  const safeInterval = Math.max(1, interval);
  const frame = Math.max(0, Math.floor(elapsedMs / safeInterval));
  if (repeatCount > 0) return Math.min(frame, frameCount * repeatCount - 1) % frameCount;
  return frame % frameCount;
}

export function polarPoint(centerX: number, centerY: number, radius: number, angle: number): Point {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
}

export function arcPath(centerX: number, centerY: number, radius: number, startAngle: number, angleRange: number): string {
  if (radius <= 0 || angleRange === 0) return "";
  const safeRange = Math.abs(angleRange) >= 360 ? Math.sign(angleRange || 1) * 359.999 : angleRange;
  const start = polarPoint(centerX, centerY, radius, startAngle);
  const end = polarPoint(centerX, centerY, radius, startAngle + safeRange);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${Math.abs(safeRange) > 180 ? 1 : 0} ${safeRange >= 0 ? 1 : 0} ${end.x} ${end.y}`;
}

/**
 * 圆弧进度条素材的背景轨道为固定上半圆时，XML 中用于设备端的扩展角度会与 PNG 轮廓不一致。
 * 预览应优先让前景裁切轨迹贴合可见背景轨道。
 */
export function arcProgressClipAngles(startAngle: number, angleRange: number, hasBackgroundTrack: boolean): { startAngle: number; angleRange: number } {
  const endAngle = startAngle + angleRange;
  const isSemicircleTrack = hasBackgroundTrack
    && startAngle <= -90
    && angleRange >= 180
    && angleRange <= 225
    && Math.abs(endAngle - 90) < 0.001;
  return isSemicircleTrack ? { startAngle: -90, angleRange: 180 } : { startAngle, angleRange };
}

export function linePoint(startX: number, startY: number, endX: number, endY: number, progress: number): Point {
  return {
    x: startX + (endX - startX) * progress,
    y: startY + (endY - startY) * progress,
  };
}

export function formatImageNumber(
  raw: number,
  totalDigits: number,
  decimalDigits: number,
  leadingZero: boolean,
  trailingZero: boolean,
): string {
  let text = decimalDigits > 0 ? raw.toFixed(decimalDigits) : Math.trunc(raw).toString();
  if (!trailingZero && decimalDigits > 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
  if (leadingZero) {
    const sign = text.startsWith("-") ? "-" : "";
    const unsigned = sign ? text.slice(1) : text;
    const targetLength = Math.max(0, totalDigits - (text.includes(".") ? 1 : 0) - sign.length);
    text = `${sign}${unsigned.padStart(targetLength, "0")}`;
  }
  return Array.from(text).slice(-Math.max(1, totalDigits)).join("");
}
