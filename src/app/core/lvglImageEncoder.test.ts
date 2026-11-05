import { describe, expect, it } from "vitest";
import {
  encodeLvglBin,
  encodeLvglRle,
  loadImagePixels,
  convertImageToLvgl,
} from "./lvglImageEncoder";
import { decodeLvglImage } from "./lvglImageDecoder";

describe("lvglImageEncoder", () => {
  it("将 2x2 RGBA 像素编码为 LVGL TrueColor .bin 并在解码后 100% 字节无损恢复", () => {
    // 构造 2x2 图像
    // pixel 0: [255, 0, 0, 255] (红)
    // pixel 1: [0, 255, 0, 255] (绿)
    // pixel 2: [0, 0, 255, 255] (蓝)
    // pixel 3: [255, 255, 0, 128] (半透明黄)
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 128,
    ]);
    const input = { width: 2, height: 2, rgba };

    const binData = encodeLvglBin(input);
    expect(binData.length).toBe(4 + 2 * 2 * 4); // 4 字节 LVGL 头 + 16 字节像素

    // 检查 4 字节头: (2 << 21) | (2 << 10) | 5
    const head = (binData[0]! | (binData[1]! << 8) | (binData[2]! << 16) | (binData[3]! << 24)) >>> 0;
    expect(head & 0x1f).toBe(5); // cf = 5
    expect((head >> 10) & 0x7ff).toBe(2); // w = 2
    expect((head >> 21) & 0x7ff).toBe(2); // h = 2

    // 逆向解码验证
    const decoded = decodeLvglImage(binData);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(2);
    expect(decoded?.rgba).toEqual(rgba);
  });

  it("将 4x4 图像编码为 LVGL Indexed8 + RLEReversed .rle 并在解码后恢复尺寸与色彩", () => {
    // 构造 4x4 包含纯色块与连续像素的图像 (以测试游程压缩)
    const width = 4;
    const height = 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      if (i < 8) {
        // 前 8 个像素为白色
        rgba[i * 4] = 255;
        rgba[i * 4 + 1] = 255;
        rgba[i * 4 + 2] = 255;
        rgba[i * 4 + 3] = 255;
      } else {
        // 后 8 个像素为黑色
        rgba[i * 4] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 255;
      }
    }
    const input = { width, height, rgba };

    const rleData = encodeLvglRle(input);
    expect(rleData.length).toBeGreaterThan(12);

    // 检查 4 字节头
    const head = (rleData[0]! | (rleData[1]! << 8) | (rleData[2]! << 16) | (rleData[3]! << 24)) >>> 0;
    expect(head & 0x1f).toBe(10); // cf = 10
    expect((head >> 10) & 0x7ff).toBe(4); // w = 4
    expect((head >> 21) & 0x7ff).toBe(4); // h = 4

    // 检查魔数 E0 21 A5 5A
    expect(rleData[4]).toBe(0xe0);
    expect(rleData[5]).toBe(0x21);
    expect(rleData[6]).toBe(0xa5);
    expect(rleData[7]).toBe(0x5a);

    // 逆向解码验证
    const decoded = decodeLvglImage(rleData);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(4);
    expect(decoded?.height).toBe(4);

    // 检查前 8 个像素 (白) 与后 8 个像素 (黑)
    for (let i = 0; i < 8; i += 1) {
      expect(decoded?.rgba[i * 4]).toBe(255);
      expect(decoded?.rgba[i * 4 + 1]).toBe(255);
      expect(decoded?.rgba[i * 4 + 2]).toBe(255);
      expect(decoded?.rgba[i * 4 + 3]).toBe(255);
    }
    for (let i = 8; i < 16; i += 1) {
      expect(decoded?.rgba[i * 4]).toBe(0);
      expect(decoded?.rgba[i * 4 + 1]).toBe(0);
      expect(decoded?.rgba[i * 4 + 2]).toBe(0);
      expect(decoded?.rgba[i * 4 + 3]).toBe(255);
    }
  });

  it("当图像尺寸超过 LVGL 限制 (2047) 或 <= 0 时抛出异常", () => {
    const dummy = { width: 0, height: 10, rgba: new Uint8Array(0) };
    expect(() => encodeLvglRle(dummy)).toThrow("图像尺寸非法");
    expect(() => encodeLvglBin(dummy)).toThrow("图像尺寸非法");

    const oversized = { width: 2048, height: 10, rgba: new Uint8Array(2048 * 10 * 4) };
    expect(() => encodeLvglRle(oversized)).toThrow("图像尺寸非法");
    expect(() => encodeLvglBin(oversized)).toThrow("图像尺寸非法");
  });

  it("loadImagePixels 支持直接解码已有 .rle / .bin 二进制数据", async () => {
    const input = {
      width: 2,
      height: 2,
      rgba: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]),
    };
    const binData = encodeLvglBin(input);
    const binBlob = new Blob([binData as unknown as BlobPart]);

    const pixels = await loadImagePixels(binBlob);
    expect(pixels.width).toBe(2);
    expect(pixels.height).toBe(2);
    expect(pixels.rgba).toEqual(input.rgba);
  });

  it("convertImageToLvgl 转换并计算体积变化比率", async () => {
    const input = {
      width: 4,
      height: 4,
      rgba: new Uint8Array(4 * 4 * 4),
    };
    const binData = encodeLvglBin(input);
    const binBlob = new Blob([binData as unknown as BlobPart]);
    const res = await convertImageToLvgl(binBlob, "rle", "test/icon.bin");
    expect(res.format).toBe("rle");
    expect(res.targetFilename).toBe("icon.rle");
    expect(res.targetPath).toBe("test/icon.rle");
    expect(res.width).toBe(4);
    expect(res.height).toBe(4);
    expect(res.data.byteLength).toBeGreaterThan(0);
  });
});
