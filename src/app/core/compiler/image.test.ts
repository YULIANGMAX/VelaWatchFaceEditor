import { describe, expect, it } from "vitest";
import { encodeImageArrayResource, encodeImageBlock } from "./image";

describe("小米表盘图片编码", () => {
  it("indexed8 超过 256 种精确颜色时执行确定性量化", () => {
    const rgba = new Uint8Array(257 * 4);
    for (let index = 0; index < 257; index += 1) {
      rgba[index * 4] = index & 0xff;
      rgba[index * 4 + 1] = index >>> 8;
      rgba[index * 4 + 3] = 255;
    }
    const first = encodeImageBlock({ width: 257, height: 1, rgba }, "indexed8", "none");
    const second = encodeImageBlock({ width: 257, height: 1, rgba }, "indexed8", "none");

    expect(first.bytes).toEqual(second.bytes);
    expect(first.bytes).toHaveLength(1024 + 257);
    expect(Math.max(...first.bytes.subarray(1024))).toBeLessThan(256);
  });

  it("None ImageArray 保留 12 字节头且长度字段只记录像素块", () => {
    const rgba = Uint8Array.of(255, 0, 0, 255);
    const images = [{ width: 1, height: 1, rgba }, { width: 1, height: 1, rgba }];
    const blocks = images.map((image) => encodeImageBlock(image, "RGBA32", "None"));
    const resource = encodeImageArrayResource(images, blocks, false);

    expect(resource).toHaveLength(20);
    expect(Array.from(resource.subarray(8, 12))).toEqual([8, 0, 0, 0]);
    expect(Array.from(resource.subarray(12))).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);
  });

  it("支持单图量化增量缓存命中并保证字节一致", () => {
    const rgba = new Uint8Array(260 * 4);
    for (let i = 0; i < 260; i += 1) {
      rgba[i * 4] = i & 0xff;
      rgba[i * 4 + 1] = (i * 2) & 0xff;
      rgba[i * 4 + 2] = (i * 3) & 0xff;
      rgba[i * 4 + 3] = 255;
    }
    const block1 = encodeImageBlock({ width: 260, height: 1, rgba }, "indexed8", "none");
    const block2 = encodeImageBlock({ width: 260, height: 1, rgba }, "indexed8", "none");
    expect(block1.bytes).toEqual(block2.bytes);
  });
});
