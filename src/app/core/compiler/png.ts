import { WatchfaceCompileError } from "./types";
import type { Diagnostic } from "../model";
import { readBlobBytes } from "./blob";

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let value = 0xffff_ffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffff_ffff) >>> 0;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function diagnostic(message: string, location: string): Diagnostic {
  return {
    id: `compile-png-${location}-${message}`,
    severity: "error",
    code: "unsupported-png",
    message,
    location,
  };
}

function fail(message: string, location: string): never {
  throw new WatchfaceCompileError(message, [diagnostic(message, location)]);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const source = bytes.slice();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(source);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unfilter(raw: Uint8Array, width: number, height: number, bytesPerPixel: number, location: string): Uint8Array {
  const rowLength = width * bytesPerPixel;
  const expected = height * (rowLength + 1);
  if (raw.length !== expected) fail(`PNG 解压长度错误：应为 ${expected}，实际为 ${raw.length}`, location);
  const result = new Uint8Array(height * rowLength);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowLength;
    const previousOffset = rowOffset - rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const encoded = raw[sourceOffset + x];
      const left = x >= bytesPerPixel ? result[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? result[previousOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? result[previousOffset + x - bytesPerPixel] : 0;
      switch (filter) {
        case 0: result[rowOffset + x] = encoded; break;
        case 1: result[rowOffset + x] = (encoded + left) & 0xff; break;
        case 2: result[rowOffset + x] = (encoded + up) & 0xff; break;
        case 3: result[rowOffset + x] = (encoded + Math.floor((left + up) / 2)) & 0xff; break;
        case 4: result[rowOffset + x] = (encoded + paeth(left, up, upLeft)) & 0xff; break;
        default: fail(`PNG 使用未知过滤器 ${filter}`, location);
      }
    }
    sourceOffset += rowLength;
  }
  return result;
}

export async function decodePng(blob: Blob, location: string): Promise<DecodedPng> {
  const bytes = await readBlobBytes(blob);
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    fail("文件不是有效 PNG", location);
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const imageParts: Uint8Array[] = [];
  let sawHeader = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail("PNG 块头截断", location);
    const length = readUint32BigEndian(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    if (crcOffset + 4 > bytes.length) fail("PNG 块数据截断", location);
    const type = String.fromCharCode(...bytes.subarray(typeOffset, typeOffset + 4));
    const expectedCrc = readUint32BigEndian(bytes, crcOffset);
    const actualCrc = crc32(bytes.subarray(typeOffset, crcOffset));
    if (actualCrc !== expectedCrc) fail(`PNG ${type} 块 CRC 错误`, location);
    const data = bytes.subarray(dataOffset, crcOffset);

    if (type === "IHDR") {
      if (sawHeader || length !== 13) fail("PNG IHDR 块无效", location);
      width = readUint32BigEndian(data, 0);
      height = readUint32BigEndian(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (!width || !height) fail("PNG 宽高必须大于 0", location);
      if (data[10] !== 0 || data[11] !== 0) fail("PNG 使用未知压缩或过滤方法", location);
      sawHeader = true;
    } else if (type === "PLTE") {
      palette = data.slice();
    } else if (type === "tRNS") {
      transparency = data.slice();
    } else if (type === "IDAT") {
      imageParts.push(data.slice());
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    } else if ((bytes[typeOffset] & 0x20) === 0) {
      fail(`PNG 包含未知关键块 ${type}`, location);
    }
    offset = crcOffset + 4;
  }

  if (!sawHeader || !sawEnd || imageParts.length === 0) fail("PNG 缺少 IHDR、IDAT 或 IEND", location);
  if (bitDepth !== 8) fail(`不支持 ${bitDepth}-bit PNG，仅支持 8-bit`, location);
  if (interlace !== 0) fail("不支持 Adam7 交错 PNG", location);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!channels) fail(`不支持 PNG 色型 ${colorType}`, location);
  if (colorType === 3 && (!palette || palette.length === 0 || palette.length % 3 !== 0 || palette.length > 768)) {
    fail("索引 PNG 缺少有效 PLTE", location);
  }

  const compressedLength = imageParts.reduce((sum, part) => sum + part.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const part of imageParts) {
    compressed.set(part, compressedOffset);
    compressedOffset += part.length;
  }
  let inflated: Uint8Array;
  try {
    inflated = await inflateZlib(compressed);
  } catch (error) {
    fail(`PNG DEFLATE 数据损坏${error instanceof Error ? `：${error.message}` : ""}`, location);
  }
  const pixels = unfilter(inflated, width, height, channels, location);
  const rgba = new Uint8Array(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const source = index * channels;
    const target = index * 4;
    if (colorType === 0) {
      const gray = pixels[source];
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      const transparentGray = transparency?.length === 2 ? (transparency[0] << 8) | transparency[1] : -1;
      rgba[target + 3] = transparentGray === gray ? 0 : 255;
    } else if (colorType === 2) {
      const red = pixels[source];
      const green = pixels[source + 1];
      const blue = pixels[source + 2];
      rgba[target] = red;
      rgba[target + 1] = green;
      rgba[target + 2] = blue;
      const transparent = transparency?.length === 6
        && ((transparency[0] << 8) | transparency[1]) === red
        && ((transparency[2] << 8) | transparency[3]) === green
        && ((transparency[4] << 8) | transparency[5]) === blue;
      rgba[target + 3] = transparent ? 0 : 255;
    } else if (colorType === 3) {
      const paletteIndex = pixels[source];
      const paletteOffset = paletteIndex * 3;
      if (!palette || paletteOffset + 2 >= palette.length) fail(`PNG 调色板索引 ${paletteIndex} 越界`, location);
      rgba[target] = palette[paletteOffset];
      rgba[target + 1] = palette[paletteOffset + 1];
      rgba[target + 2] = palette[paletteOffset + 2];
      rgba[target + 3] = transparency?.[paletteIndex] ?? 255;
    } else if (colorType === 4) {
      rgba[target] = pixels[source];
      rgba[target + 1] = pixels[source];
      rgba[target + 2] = pixels[source];
      rgba[target + 3] = pixels[source + 1];
    } else {
      rgba[target] = pixels[source];
      rgba[target + 1] = pixels[source + 1];
      rgba[target + 2] = pixels[source + 2];
      rgba[target + 3] = pixels[source + 3];
    }
  }

  return { width, height, rgba };
}
