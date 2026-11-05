/**
 * LVGL / Vela 图像编码器
 * 支持将普通图像（PNG, JPG, WebP, BMP 等）编码为手表端原生支持的:
 * 1. .rle (Indexed8 + Vela RLEReversed 游程压缩, cf = 10)
 * 2. .bin (TrueColor BGRA32 裸位图, cf = 5)
 */

import { encodeImageBlock, type Indexed8Dithering } from "./compiler/image";
import { decodeLvglImage } from "./lvglImageDecoder";
import { decodePng } from "./compiler/png";

export interface ImagePixelData {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface LvglImageConversionResult {
  format: "rle" | "bin";
  data: Uint8Array;
  width: number;
  height: number;
  targetFilename: string;
  targetPath: string;
  sourceSize: number;
  targetSize: number;
  compressionRatio: number; // 百分比，负数表示缩小
}

/**
 * 从 Blob 中解析出 RGBA 像素数据
 * 兼容浏览器环境（createImageBitmap / Canvas）与 Node/Vitest 测试环境（decodePng）
 */
export async function loadImagePixels(blob: Blob): Promise<ImagePixelData> {
  // 1. 若已经是 LVGL 格式 (.rle / .bin)，直接逆向解码
  try {
    const buffer = await blob.arrayBuffer();
    const lvgl = decodeLvglImage(new Uint8Array(buffer));
    if (lvgl) {
      return {
        width: lvgl.width,
        height: lvgl.height,
        rgba: lvgl.rgba,
      };
    }
  } catch {
    // 忽略错误，继续走普通图片解码
  }

  // 2. 浏览器环境：优先使用 createImageBitmap + Canvas，支持所有浏览器支持的图片格式
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    let rgba: Uint8Array;
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("无法创建 OffscreenCanvas 2D 上下文");
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        rgba = new Uint8Array(imgData.data.buffer);
      } else if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        rgba = new Uint8Array(imgData.data.buffer);
      } else {
        throw new Error("当前环境缺少 Canvas 支持，无法解码图像位图");
      }
    } finally {
      bitmap.close();
    }
    return { width, height, rgba };
  }

  // 3. Node.js / 单元测试环境回退：尝试通过项目内纯 JS 实现的 decodePng 解码
  const decodedPng = await decodePng(blob, "input");
  return {
    width: decodedPng.width,
    height: decodedPng.height,
    rgba: decodedPng.rgba,
  };
}

/**
 * 将 RGBA 像素编码为 LVGL Indexed8 + Vela RLEReversed 压缩格式 (.rle)
 * 格式结构：
 * [0..3]: 4字节 LVGL header (cf = 10, w, h)
 * [4..7]: 4字节魔数 E0 21 A5 5A
 * [8..11]: 4字节 meta ((rawLen << 4) | pixelType)
 * [12..]: 游程压缩数据流 (解压后为 1024 字节调色板 + w*h 字节索引)
 */
export function encodeLvglRle(
  image: ImagePixelData,
  options?: { dithering?: Indexed8Dithering },
): Uint8Array {
  const { width, height } = image;
  if (width <= 0 || height <= 0 || width > 2047 || height > 2047) {
    throw new Error(`图像尺寸非法: ${width} × ${height} (LVGL 图像宽高范围为 1 ~ 2047)`);
  }

  const headVal = (((height & 0x7ff) << 21) | ((width & 0x7ff) << 10) | 10) >>> 0;
  const header = new Uint8Array(4);
  header[0] = headVal & 0xff;
  header[1] = (headVal >> 8) & 0xff;
  header[2] = (headVal >> 16) & 0xff;
  header[3] = (headVal >> 24) & 0xff;

  const block = encodeImageBlock(
    image,
    "indexed8",
    "RLEReversed",
    options?.dithering ?? "floyd-steinberg",
  );

  const result = new Uint8Array(4 + block.bytes.length);
  result.set(header, 0);
  result.set(block.bytes, 4);
  return result;
}

/**
 * 将 RGBA 像素编码为 LVGL TrueColor BGRA32 裸位图格式 (.bin)
 * 格式结构：
 * [0..3]: 4字节 LVGL header (cf = 5, w, h)
 * [4..]: 未压缩的 BGRA 原始像素流 (w * h * 4 字节)
 */
export function encodeLvglBin(image: ImagePixelData): Uint8Array {
  const { width, height, rgba } = image;
  if (width <= 0 || height <= 0 || width > 2047 || height > 2047) {
    throw new Error(`图像尺寸非法: ${width} × ${height} (LVGL 图像宽高范围为 1 ~ 2047)`);
  }

  const headVal = (((height & 0x7ff) << 21) | ((width & 0x7ff) << 10) | 5) >>> 0;
  const header = new Uint8Array(4);
  header[0] = headVal & 0xff;
  header[1] = (headVal >> 8) & 0xff;
  header[2] = (headVal >> 16) & 0xff;
  header[3] = (headVal >> 24) & 0xff;

  const bgra = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    bgra[offset] = rgba[offset + 2]!;     // B
    bgra[offset + 1] = rgba[offset + 1]!; // G
    bgra[offset + 2] = rgba[offset]!;     // R
    bgra[offset + 3] = rgba[offset + 3]!; // A
  }

  const result = new Uint8Array(4 + bgra.length);
  result.set(header, 0);
  result.set(bgra, 4);
  return result;
}

/**
 * 一键将图像 Blob 转换为指定 LVGL 格式 (.rle 或 .bin)
 */
export async function convertImageToLvgl(
  blob: Blob,
  targetFormat: "rle" | "bin",
  sourcePath: string,
  options?: { dithering?: Indexed8Dithering },
): Promise<LvglImageConversionResult> {
  const pixels = await loadImagePixels(blob);
  const data = targetFormat === "rle"
    ? encodeLvglRle(pixels, options)
    : encodeLvglBin(pixels);

  const targetPath = sourcePath.replace(/\.[^.]+$/, `.${targetFormat}`);
  const targetFilename = targetPath.split("/").at(-1) || `image.${targetFormat}`;
  const sourceSize = blob.size;
  const targetSize = data.byteLength;
  const compressionRatio = sourceSize > 0
    ? ((targetSize - sourceSize) / sourceSize) * 100
    : 0;

  return {
    format: targetFormat,
    data,
    width: pixels.width,
    height: pixels.height,
    targetFilename,
    targetPath,
    sourceSize,
    targetSize,
    compressionRatio,
  };
}
