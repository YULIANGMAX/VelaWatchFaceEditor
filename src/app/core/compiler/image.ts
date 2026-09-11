import { applyPaletteSync, buildPaletteSync, utils as imageQuantizationUtils } from "image-q";
import { concatBytes, writeUint16, writeUint32 } from "./binary";
import type { DecodedPng } from "./png";

export type ImageFormat = "RGBA32" | "RGB565A8" | "indexed8";
export type CompressionMethod = "RLEReversed" | "None" | "none";

export interface EncodedImageBlock {
  pixelType: number;
  formatCode: number;
  compressionCode: number;
  bytes: Uint8Array;
}

export type Indexed8Dithering = "nearest" | "floyd-steinberg";

function encodeBgra32(image: DecodedPng): Uint8Array {
  const result = new Uint8Array(image.width * image.height * 4);
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    result[offset] = image.rgba[offset + 2];
    result[offset + 1] = image.rgba[offset + 1];
    result[offset + 2] = image.rgba[offset];
    result[offset + 3] = image.rgba[offset + 3];
  }
  return result;
}

function encodeRgb565A8(image: DecodedPng): Uint8Array {
  const result = new Uint8Array(image.width * image.height * 3);
  for (let source = 0, target = 0; source < image.rgba.length; source += 4, target += 3) {
    const red = Math.floor(image.rgba[source] * 31 / 255);
    const green = Math.floor(image.rgba[source + 1] * 63 / 255);
    const blue = Math.floor(image.rgba[source + 2] * 31 / 255);
    const rgb565 = (red << 11) | (green << 5) | blue;
    result[target] = rgb565 & 0xff;
    result[target + 1] = rgb565 >>> 8;
    result[target + 2] = image.rgba[source + 3];
  }
  return result;
}


function encodePaletteBytes(palette: ReturnType<typeof buildPaletteSync>): { bytes: Uint8Array; indexes: Map<number, number> } {
  const points = palette.getPointContainer().getPointArray();
  const bytes = new Uint8Array(1024);
  const indexes = new Map<number, number>();
  points.forEach((point, index) => {
    indexes.set(point.uint32, index);
    bytes.set([point.b, point.g, point.r, point.a], index * 4);
  });
  return { bytes, indexes };
}

function encodeQuantizedIndexed8Images(
  images: DecodedPng[],
  dithering: Indexed8Dithering,
): Uint8Array[] {
  const sources = images.map((image) => {
    // 清除全透明像素中不可见的 RGB，保证调色板立方体与索引对齐
    const rgba = image.rgba.slice();
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset + 3] === 0) rgba.fill(0, offset, offset + 3);
    }
    return imageQuantizationUtils.PointContainer.fromUint8Array(rgba, image.width, image.height);
  });
  const palette = buildPaletteSync(sources, { colors: 256, paletteQuantization: "wuquant" });
  const paletteData = encodePaletteBytes(palette);
  return sources.map((source, imageIndex) => {
    const quantized = applyPaletteSync(source, palette, { imageQuantization: dithering });
    const image = images[imageIndex]!;
    const result = new Uint8Array(1024 + image.width * image.height);
    result.set(paletteData.bytes);
    quantized.getPointArray().forEach((point, pixel) => {
      const index = paletteData.indexes.get(point.uint32);
      if (index === undefined) throw new Error("indexed8 量化结果引用了调色板外颜色");
      result[1024 + pixel] = index;
    });
    return result;
  });
}

const quantizedIndexed8Cache = new Map<string, Uint8Array>();
const QUANTIZED_CACHE_MAX = 256;

function quickRgbaHash(rgba: Uint8Array): number {
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(rgba.length / 256));
  for (let i = 0; i < rgba.length; i += step) {
    hash ^= rgba[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function clearQuantizedImageCache(): void {
  quantizedIndexed8Cache.clear();
}

function encodeQuantizedIndexed8(
  image: DecodedPng,
  dithering: Indexed8Dithering,
): Uint8Array {
  const cacheKey = `${image.width}_${image.height}_${image.rgba.length}_${dithering}_${quickRgbaHash(image.rgba)}`;
  const cached = quantizedIndexed8Cache.get(cacheKey);
  if (cached) return cached.slice();

  const encoded = encodeQuantizedIndexed8Images([image], dithering)[0]!;
  if (quantizedIndexed8Cache.size >= QUANTIZED_CACHE_MAX) {
    const firstKey = quantizedIndexed8Cache.keys().next().value;
    if (firstKey !== undefined) quantizedIndexed8Cache.delete(firstKey);
  }
  quantizedIndexed8Cache.set(cacheKey, encoded);
  return encoded.slice();
}

function encodeIndexed8(image: DecodedPng, dithering: Indexed8Dithering): Uint8Array {
  return encodeQuantizedIndexed8(image, dithering);
}

function equalUnit(raw: Uint8Array, first: number, second: number, unitSize: number): boolean {
  const i = first * unitSize;
  const j = second * unitSize;
  if (unitSize === 4) {
    return raw[i] === raw[j] && raw[i + 1] === raw[j + 1] && raw[i + 2] === raw[j + 2] && raw[i + 3] === raw[j + 3];
  }
  if (unitSize === 3) {
    return raw[i] === raw[j] && raw[i + 1] === raw[j + 1] && raw[i + 2] === raw[j + 2];
  }
  if (unitSize === 1) {
    return raw[i] === raw[j];
  }
  for (let byte = 0; byte < unitSize; byte += 1) {
    if (raw[i + byte] !== raw[j + byte]) return false;
  }
  return true;
}

function unitRunLength(raw: Uint8Array, unit: number, unitSize: number): number {
  const total = raw.length / unitSize;
  let count = 1;
  while (count < 127 && unit + count < total && equalUnit(raw, unit, unit + count, unitSize)) count += 1;
  return count;
}

function encodePixelRuns(raw: Uint8Array, pixelSize: number): Uint8Array {
  const maxOutputSize = Math.max(128, raw.length + Math.ceil(raw.length / pixelSize) + 32);
  let buffer = new Uint8Array(maxOutputSize);
  let cursor = 0;
  for (let offset = 0; offset < raw.length;) {
    let count = 1;
    while (count < 127 && offset + (count + 1) * pixelSize <= raw.length) {
      const base = offset;
      const target = offset + count * pixelSize;
      let equal = true;
      if (pixelSize === 4) {
        equal = raw[base] === raw[target] && raw[base + 1] === raw[target + 1] && raw[base + 2] === raw[target + 2] && raw[base + 3] === raw[target + 3];
      } else if (pixelSize === 3) {
        equal = raw[base] === raw[target] && raw[base + 1] === raw[target + 1] && raw[base + 2] === raw[target + 2];
      } else if (pixelSize === 1) {
        equal = raw[base] === raw[target];
      } else {
        for (let byte = 0; byte < pixelSize; byte += 1) {
          if (raw[base + byte] !== raw[target + byte]) {
            equal = false;
            break;
          }
        }
      }
      if (!equal) break;
      count += 1;
    }
    const needed = 1 + pixelSize;
    if (cursor + needed > buffer.length) {
      const next = new Uint8Array(Math.max(buffer.length * 2, cursor + needed + 1024));
      next.set(buffer);
      buffer = next;
    }
    buffer[cursor++] = count;
    for (let b = 0; b < pixelSize; b += 1) {
      buffer[cursor++] = raw[offset + b]!;
    }
    offset += count * pixelSize;
  }
  return buffer.subarray(0, cursor);
}

function encodeUnitRuns(raw: Uint8Array, unitSize: number): Uint8Array {
  const total = raw.length / unitSize;
  const maxOutputSize = Math.max(128, raw.length + Math.ceil(total) + 64);
  let buffer = new Uint8Array(maxOutputSize);
  let cursor = 0;
  let unit = 0;
  while (unit < total) {
    const run = unitRunLength(raw, unit, unitSize);
    // 0.9.8 的两个阈值并不对称：包入口的 5 连续会编码为 repeat，
    // 但 literal 扫描过程中只有 7 连续才截断，并把首个像素留在 literal 内。
    if (run >= 5) {
      const needed = 1 + unitSize;
      if (cursor + needed > buffer.length) {
        const next = new Uint8Array(Math.max(buffer.length * 2, cursor + needed + 1024));
        next.set(buffer);
        buffer = next;
      }
      buffer[cursor++] = run;
      const srcOffset = unit * unitSize;
      for (let b = 0; b < unitSize; b += 1) {
        buffer[cursor++] = raw[srcOffset + b]!;
      }
      unit += run;
      continue;
    }
    const start = unit;
    unit += run;
    while (unit < total && unit - start < 127) {
      const nextRun = unitRunLength(raw, unit, unitSize);
      if (nextRun >= 7) {
        unit += 1;
        break;
      }
      unit += Math.min(nextRun, 127 - (unit - start));
    }
    const count = unit - start;
    const byteLen = count * unitSize;
    const needed = 1 + byteLen;
    if (cursor + needed > buffer.length) {
      const next = new Uint8Array(Math.max(buffer.length * 2, cursor + needed + 1024));
      next.set(buffer);
      buffer = next;
    }
    buffer[cursor++] = 0x80 | count;
    buffer.set(raw.subarray(start * unitSize, unit * unitSize), cursor);
    cursor += byteLen;
  }
  return buffer.subarray(0, cursor);
}

function encodeRgb565Runs(raw: Uint8Array): Uint8Array {
  return encodeUnitRuns(raw, 3);
}

function wrapCompressed(raw: Uint8Array, pixelType: number): Uint8Array {
  const compressed = encodeUnitRuns(raw, pixelType === 3 ? 3 : pixelType === 4 ? 4 : 1);
  const result = new Uint8Array(8 + compressed.length);
  result.set([0xe0, 0x21, 0xa5, 0x5a], 0);
  writeUint32(result, 4, raw.length * 16 + pixelType);
  result.set(compressed, 8);
  return result;
}

export function encodeImageBlock(
  image: DecodedPng,
  format: ImageFormat,
  compression: CompressionMethod,
  indexed8Dithering: Indexed8Dithering = "floyd-steinberg",
): EncodedImageBlock {
  const pixelType = format === "indexed8" ? 1 : format === "RGB565A8" ? 3 : 4;
  const formatCode = format === "indexed8" ? 0x10 : format === "RGB565A8" ? 0x06 : 0;
  const raw = format === "indexed8" ? encodeIndexed8(image, indexed8Dithering) : format === "RGB565A8" ? encodeRgb565A8(image) : encodeBgra32(image);
  return { pixelType, formatCode, compressionCode: compression === "RLEReversed" ? 4 : 0, bytes: compression === "RLEReversed" ? wrapCompressed(raw, pixelType) : raw };
}

export function encodeSingleImageResource(image: DecodedPng, block: EncodedImageBlock, recolor = false): Uint8Array {
  const header = new Uint8Array(12);
  header[0] = block.formatCode;
  header[1] = block.compressionCode + (recolor ? 1 : 0);
  writeUint16(header, 4, image.width);
  writeUint16(header, 6, image.height);
  writeUint32(header, 8, block.bytes.length);
  return concatBytes([header, block.bytes]);
}

export function encodeImageArrayResource(
  images: DecodedPng[],
  blocks: EncodedImageBlock[],
  recolor = false,
): Uint8Array {
  if (images.length === 0 || images.length !== blocks.length) throw new Error("ImageArray 没有有效图片");
  const { width, height } = images[0];
  if (images.some((image) => image.width !== width || image.height !== height)) throw new Error("ImageArray 中所有图片尺寸必须相同");
  if (blocks.some((block) => block.pixelType !== blocks[0].pixelType)) throw new Error("ImageArray 中所有图片格式必须相同");
  if (blocks.some((block) => block.formatCode !== blocks[0].formatCode || block.compressionCode !== blocks[0].compressionCode)) {
    throw new Error("ImageArray 中所有图片编码方式必须相同");
  }
  if (blocks[0].compressionCode === 0) {
    const rawLength = blocks.reduce((sum, block) => sum + block.bytes.length, 0);
    const result = new Uint8Array(12 + rawLength);
    result[0] = blocks[0].formatCode;
    result[1] = images.length;
    result[2] = recolor ? 1 : 0;
    writeUint16(result, 4, width);
    writeUint16(result, 6, height);
    writeUint32(result, 8, rawLength);
    let offset = 12;
    for (const block of blocks) {
      result.set(block.bytes, offset);
      offset += block.bytes.length;
    }
    return result;
  }
  const headerLength = 12 + blocks.length * 4;
  const totalLength = headerLength + blocks.reduce((sum, block) => sum + block.bytes.length, 0);
  const header = new Uint8Array(headerLength);
  header[1] = images.length;
  header[0] = blocks[0].formatCode;
  header[2] = blocks[0].compressionCode + (recolor ? 1 : 0);
  writeUint16(header, 4, width);
  writeUint16(header, 6, height);
  writeUint32(header, 8, totalLength - headerLength);
  blocks.forEach((block, index) => writeUint32(header, 12 + index * 4, block.bytes.length));
  return concatBytes([header, ...blocks.map((block) => block.bytes)]);
}

export const imageEncodingInternals = {
  encodeBgra32,
  encodeRgb565A8,
  encodeIndexed8,
  encodePixelRuns,
  encodeRgb565Runs,
};
