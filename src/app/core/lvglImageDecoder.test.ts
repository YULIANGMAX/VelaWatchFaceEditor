import { describe, expect, it } from "vitest";
import { decodeLvglImage } from "./lvglImageDecoder";
import fs from "node:fs";

describe("lvglImageDecoder", () => {
  it("解码 TrueColor BGRA32 (.bin)", () => {
    // 构造一个 2x2 的 BGRA 图像
    // w=2, h=2, cf=5
    const head = (2 << 21) | (2 << 10) | 5;
    const data = new Uint8Array(4 + 2 * 2 * 4);
    data[0] = head & 0xff;
    data[1] = (head >> 8) & 0xff;
    data[2] = (head >> 16) & 0xff;
    data[3] = (head >> 24) & 0xff;
    // pixel 0: BGRA = [0, 100, 200, 255] -> RGBA = [200, 100, 0, 255]
    data[4] = 0; data[5] = 100; data[6] = 200; data[7] = 255;
    // pixel 1: BGRA = [255, 0, 0, 128] -> RGBA = [0, 0, 255, 128]
    data[8] = 255; data[9] = 0; data[10] = 0; data[11] = 128;

    const decoded = decodeLvglImage(data);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(2);
    expect(decoded?.rgba[0]).toBe(200);
    expect(decoded?.rgba[1]).toBe(100);
    expect(decoded?.rgba[2]).toBe(0);
    expect(decoded?.rgba[3]).toBe(255);
    expect(decoded?.rgba[4]).toBe(0);
    expect(decoded?.rgba[5]).toBe(0);
    expect(decoded?.rgba[6]).toBe(255);
    expect(decoded?.rgba[7]).toBe(128);
  });

  it("解码 Indexed8 RLE 压缩图像 (.rle)", () => {
    // 构造 2x2 indexed8 图像: w=2, h=2, cf=10
    const head = (2 << 21) | (2 << 10) | 10;
    const rawLen = 1024 + 4; // 1024 字节调色板 + 4 字节像素索引
    const meta = (rawLen << 4) | 1;

    // 构建解压前的原始数据
    // 调色板 index 0: BGRA = [10, 20, 30, 255] -> RGBA = [30, 20, 10, 255]
    // 调色板 index 1: BGRA = [50, 60, 70, 255] -> RGBA = [70, 60, 50, 255]
    // 其它调色板为 0
    // 像素索引: [0, 1, 1, 0]
    const uncompressed = new Uint8Array(rawLen);
    uncompressed[0] = 10; uncompressed[1] = 20; uncompressed[2] = 30; uncompressed[3] = 255;
    uncompressed[4] = 50; uncompressed[5] = 60; uncompressed[6] = 70; uncompressed[7] = 255;
    uncompressed[1024] = 0;
    uncompressed[1025] = 1;
    uncompressed[1026] = 1;
    uncompressed[1027] = 0;

    // 将 uncompressed 压缩为 RLEReversed 流 (使用字面量块与重复块)
    // 调色板前 8 字节: literal 8 字节 (0x80 | 8 = 0x88)
    // 调色板中间 1016 字节全为 0: 4 个重复 254 字节 0 (0xfe, 0)
    // 像素 4 字节: literal 4 字节 (0x80 | 4 = 0x84)
    const stream: number[] = [
      0x80 | 8,
      10, 20, 30, 255, 50, 60, 70, 255,
      127, 0, // 重复 127 个 0
      127, 0, // 重复 127 个 0
      127, 0,
      127, 0,
      127, 0,
      127, 0,
      127, 0,
      127, 0, // 8 * 127 = 1016 个 0
      0x80 | 4,
      0, 1, 1, 0,
    ];

    const data = new Uint8Array(12 + stream.length);
    data[0] = head & 0xff;
    data[1] = (head >> 8) & 0xff;
    data[2] = (head >> 16) & 0xff;
    data[3] = (head >> 24) & 0xff;
    data[4] = 0xe0; data[5] = 0x21; data[6] = 0xa5; data[7] = 0x5a;
    data[8] = meta & 0xff;
    data[9] = (meta >> 8) & 0xff;
    data[10] = (meta >> 16) & 0xff;
    data[11] = (meta >> 24) & 0xff;
    data.set(stream, 12);

    const decoded = decodeLvglImage(data);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(2);
    // pixel 0 (index 0): RGBA = [30, 20, 10, 255]
    expect(decoded?.rgba[0]).toBe(30);
    expect(decoded?.rgba[1]).toBe(20);
    expect(decoded?.rgba[2]).toBe(10);
    expect(decoded?.rgba[3]).toBe(255);
    // pixel 1 (index 1): RGBA = [70, 60, 50, 255]
    expect(decoded?.rgba[4]).toBe(70);
    expect(decoded?.rgba[5]).toBe(60);
    expect(decoded?.rgba[6]).toBe(50);
    expect(decoded?.rgba[7]).toBe(255);
  });

  it("非法或截断数据返回 null", () => {
    expect(decodeLvglImage(new Uint8Array([]))).toBeNull();
    expect(decodeLvglImage(new Uint8Array([0, 0, 0, 0]))).toBeNull();
    // 错误魔数
    expect(decodeLvglImage(new Uint8Array([10, 0, 0, 0, 1, 2, 3, 4]))).toBeNull();
  });

  it("真实解包表盘样本测试 (若样本存在)", () => {
    const stepBinPath = "D:/WatchFace/test/resources/_lua/lua/step.bin";
    const bgRlePath = "D:/WatchFace/test/resources/_lua/lua/bg.rle";

    if (fs.existsSync(stepBinPath)) {
      const buf = fs.readFileSync(stepBinPath);
      const decoded = decodeLvglImage(new Uint8Array(buf));
      expect(decoded).not.toBeNull();
      expect(decoded?.width).toBe(20);
      expect(decoded?.height).toBe(20);
      expect(decoded?.rgba.length).toBe(20 * 20 * 4);
    }

    if (fs.existsSync(bgRlePath)) {
      const buf = fs.readFileSync(bgRlePath);
      const decoded = decodeLvglImage(new Uint8Array(buf));
      expect(decoded).not.toBeNull();
      expect(decoded?.width).toBe(432);
      expect(decoded?.height).toBe(514);
      expect(decoded?.rgba.length).toBe(432 * 514 * 4);
    }
  });
});
