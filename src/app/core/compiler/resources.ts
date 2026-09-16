import { refName, type WatchfaceResource } from "../model";
import type { DeviceDataSourceDefinition, DeviceBinaryDefinition } from "../../device-definition";
import { concatBytes, writeInt16, writeInt32, writeUint16, writeUint24, writeUint32 } from "./binary";
import {
  ALIGN_CODES,
  encodeDataSource,
  JUMP_APP_CODES,
  RENDER_RULE_CODES,
  TEXT_ALIGN_CODES,
  TRANSLATION_LANGUAGES,
} from "./mappings";

export interface ResourceReference {
  index: number;
  type: number;
}

export type ResolveReference = (value: string | undefined, expectedType?: number) => ResourceReference;

function numberValue(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`数值无效：${value}`);
  return parsed;
}

function booleanValue(value: string | undefined, fallback = false): boolean {
  return value === undefined || value === "" ? fallback : value === "true";
}

function encodeReference(result: Uint8Array, offset: number, reference: ResourceReference): void {
  writeUint24(result, offset, reference.index);
  result[offset + 3] = reference.type;
}

function encodeColor(value: string | undefined): [number, number, number] {
  const color = value ?? "#000000";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`颜色无效：${color}`);
  return [Number.parseInt(color.slice(5, 7), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(1, 3), 16)];
}

type DataSourceCodes = DeviceDataSourceDefinition;

function commonData(resource: WatchfaceResource, result: Uint8Array, codes: DataSourceCodes): void {
  result.set(encodeDataSource(resource.attrs.source, codes), 0);
  result[4] = RENDER_RULE_CODES[resource.attrs.renderRule ?? "alwaysShow"] ?? 0;
  result[5] = booleanValue(resource.attrs.supportRecolor) ? 1 : 0;
  writeUint16(result, 6, numberValue(resource.attrs.parameter, 1000));
  writeInt16(result, 14, Math.round(numberValue(resource.attrs.rotation) * 10));
}

export function encodeSprite(resource: WatchfaceResource, resolve: ResolveReference): Uint8Array {
  const result = new Uint8Array(12);
  encodeReference(result, 0, resolve(resource.attrs.ref, 3));
  writeUint16(result, 6, numberValue(resource.attrs.interval, 80));
  writeUint16(result, 8, numberValue(resource.attrs.repeatCount));
  return result;
}

export function encodeTranslation(resource: WatchfaceResource): Uint8Array {
  const values = new Map(resource.children.map((child) => [child.attrs.language, child.attrs.str ?? ""]));
  let mask = 0;
  const parts: Uint8Array[] = [];
  const lengths = new Uint8Array(values.size * 4);
  let lengthIndex = 0;
  TRANSLATION_LANGUAGES.forEach((language, index) => {
    const value = values.get(language);
    if (value === undefined) return;
    mask |= 1 << index;
    const bytes = new TextEncoder().encode(value);
    writeUint32(lengths, lengthIndex * 4, bytes.length);
    lengthIndex += 1;
    parts.push(bytes);
  });
  if (lengthIndex !== values.size) {
    const unknown = [...values.keys()].filter((language) => !TRANSLATION_LANGUAGES.includes(language as never));
    throw new Error(`未知 Translation 语言：${unknown.join("、")}`);
  }
  const header = new Uint8Array(8);
  writeUint32(header, 0, mask >>> 0);
  return concatBytes([header, lengths, ...parts]);
}

function encodeImageNumber(resource: WatchfaceResource, resolve: ResolveReference, codes: DataSourceCodes): Uint8Array {
  const result = new Uint8Array(20);
  commonData(resource, result, codes);
  result[2] = ((numberValue(resource.attrs.decimalDigits) & 0x0f) << 4) | (numberValue(resource.attrs.totalDigits) & 0x0f);
  result[3] = 0x10
    | (ALIGN_CODES[resource.attrs.align ?? "left"] ?? 1)
    | (booleanValue(resource.attrs.leadingZero) ? 0x04 : 0)
    | (booleanValue(resource.attrs.trailingZero) ? 0x08 : 0);
  encodeReference(result, 8, resolve(resource.attrs.ref, 3));
  result[12] = numberValue(resource.attrs.decimalOffsetX) & 0xff;
  result[13] = numberValue(resource.attrs.space) & 0xff;
  if (resource.attrs.unitIcon) encodeReference(result, 16, resolve(resource.attrs.unitIcon, 2));
  return result;
}

function encodeImageValues(
  resource: WatchfaceResource,
  resolve: ResolveReference,
  codes: DataSourceCodes,
  encoding: DeviceBinaryDefinition["resourceEncoding"] | undefined,
): Uint8Array {
  const result = new Uint8Array(16 + resource.children.length * 4);
  commonData(resource, result, codes);
  const parameterDefault = encoding?.imageValuesParameterDefault ?? 1000;
  writeUint16(result, 6, encoding?.imageValuesParameterMode === "attribute"
    ? numberValue(resource.attrs.parameter, parameterDefault)
    : parameterDefault);
  result[3] = 0x20;
  encodeReference(result, 8, resolve(resource.attrs.ref, 3));
  writeUint16(result, 12, resource.children.length > 0 ? 0x200 : 0);
  resource.children.forEach((child, index) => writeInt16(result, 16 + index * 4, numberValue(child.attrs.value)));
  return result;
}

function encodePointer(resource: WatchfaceResource, resolve: ResolveReference, codes: DataSourceCodes): Uint8Array {
  const result = new Uint8Array(32);
  commonData(resource, result, codes);
  result[3] = 0x30;
  encodeReference(result, 8, resolve(resource.attrs.ref, 2));
  encodeFixedOrSource(result, 12, resource.attrs.valueStart, resource.attrs.valueStartSource, codes);
  encodeFixedOrSource(result, 16, resource.attrs.valueRange, resource.attrs.valueRangeSource, codes);
  writeInt16(result, 20, numberValue(resource.attrs.pivotX));
  writeInt16(result, 22, numberValue(resource.attrs.pivotY));
  writeInt16(result, 24, Math.round(numberValue(resource.attrs.angleStart) * 10));
  writeInt16(result, 26, Math.round(numberValue(resource.attrs.angleRange) * 10));
  return result;
}

function encodeFixedOrSource(result: Uint8Array, offset: number, value: string | undefined, source: string | undefined, codes: DataSourceCodes): void {
  if (source) {
    result.set(encodeDataSource(source, codes), offset);
    result[offset + 2] = 1;
  } else {
    writeInt32(result, offset, Math.round(numberValue(value) * 256));
  }
}

function encodeProgress(
  resource: WatchfaceResource,
  resolve: ResolveReference,
  arc: boolean,
  codes: DataSourceCodes,
  parameterDefault: number,
): Uint8Array {
  const hasIndicator = Boolean(resource.attrs.indicatorImage);
  const result = new Uint8Array(hasIndicator ? 52 : 40);
  commonData(resource, result, codes);
  writeUint16(result, 6, numberValue(resource.attrs.parameter, parameterDefault));
  result[3] = arc ? 0x40 : 0x50;
  encodeReference(result, 8, resolve(resource.attrs.ref, 2));
  if (resource.attrs.bg) encodeReference(result, 12, resolve(resource.attrs.bg, 2));
  writeUint32(result, 16, (resource.attrs.endingStyle === "round" ? 1 : 0) | (hasIndicator ? 2 : 0));
  encodeFixedOrSource(result, 20, resource.attrs.valueStart, resource.attrs.valueStartSource, codes);
  encodeFixedOrSource(result, 24, resource.attrs.valueRange, resource.attrs.valueRangeSource, codes);
  if (arc) {
    writeInt16(result, 28, numberValue(resource.attrs.pivotX));
    writeInt16(result, 30, numberValue(resource.attrs.pivotY));
    writeInt16(result, 32, Math.round(numberValue(resource.attrs.angleStart) * 10));
    writeInt16(result, 34, Math.round(numberValue(resource.attrs.angleRange) * 10));
    writeUint16(result, 36, Math.trunc(numberValue(resource.attrs.barRadius)));
    writeUint16(result, 38, Math.trunc(numberValue(resource.attrs.barWidth)));
  } else {
    writeInt16(result, 28, numberValue(resource.attrs.startX));
    writeInt16(result, 30, numberValue(resource.attrs.startY));
    writeInt16(result, 32, numberValue(resource.attrs.endX));
    writeInt16(result, 34, numberValue(resource.attrs.endY));
    writeUint16(result, 38, Math.trunc(numberValue(resource.attrs.barWidth)));
  }
  if (hasIndicator) {
    encodeReference(result, 40, resolve(resource.attrs.indicatorImage, 2));
    if (arc) writeInt16(result, 44, numberValue(resource.attrs.indicatorRadius));
    else {
      writeInt16(result, 44, numberValue(resource.attrs.offsetX));
      writeInt16(result, 46, numberValue(resource.attrs.offsetY));
    }
  }
  return result;
}

const FONT_IDS: Readonly<Record<string, number>> = { misanslatin: 0, misansw: 1, misanstc: 2, misans: 3, notosans: 5 };
const FONT_WEIGHTS: Readonly<Record<string, number>> = {
  bold: 0, demibold: 1, extralight: 2, heavy: 3, light: 4,
  medium: 5, normal: 6, regular: 7, semibold: 8, thin: 9,
};
const LONG_MODES: Readonly<Record<string, number>> = { wrap: 0, dots: 1, scroll: 2, scroll_circular: 3, clip: 4 };
const VERTICAL_ALIGN: Readonly<Record<string, number>> = { top: 0, center: 4, bottom: 8 };

function encodeText(resource: WatchfaceResource, codes: DataSourceCodes): Uint8Array {
  const format = new TextEncoder().encode(resource.attrs.string ?? "");
  const sources = resource.children.filter((child) => child.attrs.source).map((child) => encodeDataSource(child.attrs.source, codes));
  const result = new Uint8Array(48 + format.length + sources.length * 2);
  writeUint16(result, 6, numberValue(resource.attrs.parameter, 1000));
  result.set(encodeColor(resource.attrs.color), 8);
  result[11] = resource.attrs.opacity === undefined ? 0
    : Math.max(0, Math.min(64, Math.floor(numberValue(resource.attrs.opacity) * 64 / 100)));
  result[12] = numberValue(resource.attrs.fontSize, 10) & 0xff;
  writeUint16(result, 13,
    (FONT_IDS[resource.attrs.fontId ?? "misanslatin"] ?? 0)
    | ((FONT_WEIGHTS[resource.attrs.fontWeight ?? "bold"] ?? 0) << 6)
    | (sources.length << 9));
  const isArc = resource.attrs.style === "arc";
  result[16] = (TEXT_ALIGN_CODES[resource.attrs.align ?? "left"] ?? 0)
    | ((LONG_MODES[resource.attrs.longMode ?? "dots"] ?? 1) << 3)
    | (isArc ? 0x40 : 0);
  if (isArc) {
    result[20] = numberValue(resource.attrs.radius) & 0xff;
    result[21] = VERTICAL_ALIGN[resource.attrs.verticalAlign ?? "top"] ?? 0;
    writeInt16(result, 24, Math.round(numberValue(resource.attrs.startAngle) * 10));
    writeInt16(result, 26, Math.round(numberValue(resource.attrs.span) * 10));
  } else {
    result[20] = numberValue(resource.attrs.lineSpace) & 0xff;
    result[21] = numberValue(resource.attrs.w) & 0xff;
    writeUint16(result, 22, Math.round(numberValue(resource.attrs.h) * 4));
    writeInt16(result, 24, Math.round(numberValue(resource.attrs.rotation) * 10));
  }
  writeUint32(result, 44, format.length | (sources.length << 8));
  result.set(format, 48);
  let offset = 48 + format.length;
  for (const source of sources) {
    result.set(source, offset);
    offset += 2;
  }
  return result;
}

export function encodeDataResource(
  resource: WatchfaceResource,
  resolve: ResolveReference,
  codes: DataSourceCodes,
  encoding?: DeviceBinaryDefinition["resourceEncoding"],
): Uint8Array {
  switch (resource.type) {
    case "DataItemText": return encodeText(resource, codes);
    case "DataItemImageNumber": return encodeImageNumber(resource, resolve, codes);
    case "DataItemImageValues": return encodeImageValues(resource, resolve, codes, encoding);
    case "DataItemPointer": return encodePointer(resource, resolve, codes);
    case "DataItemArcProgressBar": return encodeProgress(resource, resolve, true, codes, encoding?.progressParameterDefault ?? 1000);
    case "DataItemLineProgressBar": return encodeProgress(resource, resolve, false, codes, encoding?.progressParameterDefault ?? 1000);
    default: throw new Error(`不是数据资源：${resource.type}`);
  }
}

export function encodeSlot(resource: WatchfaceResource, resolve: ResolveReference): Uint8Array {
  if (resource.attrs.type !== "widget") throw new Error(`未知 Slot 类型：${resource.attrs.type}`);
  const items = resource.children.filter((child) => child.tag === "Item" || (!child.tag && child.attrs.ref));
  const positions = resource.children.filter((child) => child.tag === "Position" || (!child.tag && (child.attrs.x !== undefined || child.attrs.y !== undefined)));
  const isMovable = resource.attrs.movable === "true" && positions.length > 0;

  if (!isMovable) {
    const result = new Uint8Array(4 + items.length * 4);
    writeUint32(result, 0, items.length);
    items.forEach((child, index) => encodeReference(result, 4 + index * 4, resolve(child.attrs.ref, 9)));
    return result;
  }

  const result = new Uint8Array(4 + items.length * 4 + positions.length * 4);
  writeUint16(result, 0, items.length);
  result[2] = 0x01;
  result[3] = positions.length;

  let offset = 4;
  for (const item of items) {
    encodeReference(result, offset, resolve(item.attrs.ref, 9));
    offset += 4;
  }
  for (const pos of positions) {
    const x = Math.round(Number(pos.attrs.x) || 0) & 0x3ff;
    const y = Math.round(Number(pos.attrs.y) || 0) & 0x3ff;
    const code = x | (y << 10);
    writeUint32(result, offset, code);
    offset += 4;
  }
  return result;
}

function flexBits(resource: WatchfaceResource): number | undefined {
  if (!resource.attrs.flex_direction) return undefined;
  let bits = resource.attrs.flex_direction === "column" ? 1 : 0;
  if (resource.attrs.justify_content === "center") bits |= 0x04;
  else if (resource.attrs.justify_content === "flex-end") bits |= 0x08;
  if (resource.attrs.align_content === "center") bits |= 0x20;
  else if (resource.attrs.align_content === "flex-end") bits |= 0x40;
  if (resource.attrs.align_items === "center") bits |= 0x100;
  else if (resource.attrs.align_items === "flex-end") bits |= 0x200;
  const gap = numberValue(resource.attrs.gap);
  const magnitude = (Math.abs(gap) & 0x1ff) * 0x800;
  bits |= gap < 0 ? 0x100000 | magnitude : magnitude;
  return bits;
}

export function encodeWidget(
  resource: WatchfaceResource,
  resolve: ResolveReference,
  fallbackSize?: { width: number; height: number },
): Uint8Array {
  const flex = flexBits(resource);
  const argsLength = resource.attrs.args ? 4 : 0;
  const editBoxLength = resource.attrs.editBox ? 4 : 0;
  const result = new Uint8Array(44 + resource.children.length * 8 + editBoxLength + 4 + (flex === undefined ? 0 : 4) + argsLength);
  if (resource.attrs.widgetName?.startsWith("@")) {
    result.fill(0xff, 0, 4);
    encodeReference(result, 4, resolve(resource.attrs.widgetName, 6));
  } else {
    result.set(new TextEncoder().encode(resource.attrs.widgetName ?? "").subarray(0, 36), 0);
  }
  if (resource.attrs.preview) encodeReference(result, 36, resolve(resource.attrs.preview, 2));
  writeUint16(result, 40, resource.children.length);
  const app = resource.attrs.jumpApp ? JUMP_APP_CODES[resource.attrs.jumpApp] : 0x1000;
  if (resource.attrs.jumpApp && app === undefined) throw new Error(`未知 jumpApp：${resource.attrs.jumpApp}`);
  writeUint16(result, 42,
    (app ?? 0x1000)
    | (resource.attrs.jumpApp ? 0x01 : 0)
    | (resource.attrs.editBox ? 0x04 : 0)
    | (resource.attrs.args ? 0x2000 : 0)
    | (flex === undefined ? 0 : 0x4000));
  resource.children.forEach((child, index) => {
    const offset = 44 + index * 8;
    writeInt16(result, offset, numberValue(child.attrs.x));
    writeInt16(result, offset + 2, numberValue(child.attrs.y));
    encodeReference(result, offset + 4, resolve(child.attrs.ref));
  });
  const editBoxOffset = 44 + resource.children.length * 8;
  if (resource.attrs.editBox) encodeReference(result, editBoxOffset, resolve(resource.attrs.editBox, 2));
  const sizeOffset = editBoxOffset + editBoxLength;
  const finalH = resource.attrs.h !== undefined && resource.attrs.h !== ""
    ? numberValue(resource.attrs.h)
    : (fallbackSize?.height ?? 0);
  const finalW = resource.attrs.w !== undefined && resource.attrs.w !== ""
    ? numberValue(resource.attrs.w)
    : (fallbackSize?.width ?? 0);
  writeUint16(result, sizeOffset, finalH);
  writeUint16(result, sizeOffset + 2, finalW);
  if (flex !== undefined) writeUint32(result, sizeOffset + 4, flex);
  if (resource.attrs.args) {
    encodeReference(result, sizeOffset + 4 + (flex === undefined ? 0 : 4), resolve(resource.attrs.args, 5));
  }
  return result;
}

export function referencedName(value: string | undefined): string {
  return refName(value);
}
