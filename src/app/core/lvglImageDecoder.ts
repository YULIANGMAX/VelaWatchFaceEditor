/**
 * LVGL / Vela 二进制图片解码器
 * 支持手表端预编译的 .bin (TrueColor BGRA32) 与 .rle (Indexed8 游程压缩)
 * 无损解码为可在浏览器直接显示的图片 (ImageData / PNG Blob)
 */

export interface DecodedLvglImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/**
 * 尝试解析 LVGL 图片文件头并解出 RGBA 像素
 */
export function decodeLvglImage(data: Uint8Array): DecodedLvglImage | null {
  if (data.length < 8) return null;

  // 0..4: 32位 little-endian lv_img_header_t
  const h = (data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24)) >>> 0;
  const cf = h & 0x1f;
  const w = (h >> 10) & 0x7ff;
  const hVal = (h >> 21) & 0x7ff;

  if (w <= 0 || hVal <= 0 || w > 4096 || hVal > 4096) return null;

  // 1. cf = 5: LV_IMG_CF_TRUE_COLOR_ALPHA (BGRA8888 裸数据)
  if (cf === 5) {
    const pixelBytes = w * hVal * 4;
    if (data.length < 4 + pixelBytes) return null;
    const rgba = new Uint8Array(pixelBytes);
    const raw = data.subarray(4, 4 + pixelBytes);
    for (let i = 0; i < pixelBytes; i += 4) {
      rgba[i] = raw[i + 2]!; // R
      rgba[i + 1] = raw[i + 1]!; // G
      rgba[i + 2] = raw[i]!; // B
      rgba[i + 3] = raw[i + 3]!; // A
    }
    return { width: w, height: hVal, rgba };
  }

  // 2. cf = 10: LV_IMG_CF_INDEXED_8BIT + Vela RLEReversed 压缩
  if (cf === 10) {
    // 检查 RLEReversed 压缩魔数 [0xe0, 0x21, 0xa5, 0x5a]
    if (data[4] !== 0xe0 || data[5] !== 0x21 || data[6] !== 0xa5 || data[7] !== 0x5a) {
      return null;
    }
    if (data.length < 12) return null;
    const meta = (data[8]! | (data[9]! << 8) | (data[10]! << 16) | (data[11]! << 24)) >>> 0;
    const pixelType = meta & 0x0f;
    const rawLen = meta >> 4;
    const unitSize = pixelType === 3 ? 3 : pixelType === 4 ? 4 : 1;

    // 解压游程数据流
    const stream = data.subarray(12);
    const uncompressed = new Uint8Array(rawLen);
    let inCursor = 0;
    let outCursor = 0;

    while (inCursor < stream.length && outCursor < rawLen) {
      const hdr = stream[inCursor++]!;
      if ((hdr & 0x80) === 0) {
        // 重复块
        const count = hdr;
        if (inCursor + unitSize > stream.length) break;
        const unit = stream.subarray(inCursor, inCursor + unitSize);
        inCursor += unitSize;
        for (let c = 0; c < count && outCursor + unitSize <= rawLen; c += 1) {
          uncompressed.set(unit, outCursor);
          outCursor += unitSize;
        }
      } else {
        // 字面量块
        const count = hdr & 0x7f;
        const byteLen = count * unitSize;
        if (inCursor + byteLen > stream.length) break;
        const chunk = stream.subarray(inCursor, inCursor + byteLen);
        inCursor += byteLen;
        const copyLen = Math.min(byteLen, rawLen - outCursor);
        uncompressed.set(chunk.subarray(0, copyLen), outCursor);
        outCursor += copyLen;
      }
    }

    // indexed8: 前 1024 字节为调色板 (256 * 4字节 BGRA)
    if (uncompressed.length < 1024 + w * hVal) return null;
    const palette = uncompressed.subarray(0, 1024);
    const indices = uncompressed.subarray(1024, 1024 + w * hVal);
    const rgba = new Uint8Array(w * hVal * 4);

    for (let p = 0; p < indices.length; p += 1) {
      const idx = indices[p]!;
      const palOffset = idx * 4;
      const targetOffset = p * 4;
      rgba[targetOffset] = palette[palOffset + 2]!; // R
      rgba[targetOffset + 1] = palette[palOffset + 1]!; // G
      rgba[targetOffset + 2] = palette[palOffset]!; // B
      rgba[targetOffset + 3] = palette[palOffset + 3]!; // A
    }

    return { width: w, height: hVal, rgba };
  }

  return null;
}

/**
 * 将解码出的 RGBA 转换为可在浏览器 <img> 中显示的 PNG Blob URL 与 Blob
 */
export async function createLvglPreview(decoded: DecodedLvglImage): Promise<{ url: string; blob: Blob } | null> {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const clamped = new Uint8ClampedArray(decoded.rgba);
    const imgData = new ImageData(clamped, decoded.width, decoded.height);
    ctx.putImageData(imgData, 0, 0);

    return await new Promise<{ url: string; blob: Blob } | null>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve({ url: URL.createObjectURL(blob), blob });
      }, "image/png");
    });
  } catch {
    return null;
  }
}

/**
 * 将解码出的 RGBA 转换为可在浏览器 <img> 中显示的 PNG Blob URL
 */
export async function createLvglPreviewUrl(decoded: DecodedLvglImage): Promise<string | null> {
  const preview = await createLvglPreview(decoded);
  return preview?.url ?? null;
}
