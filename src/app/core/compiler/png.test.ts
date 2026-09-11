import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { decodePng } from "./png";
import { readBlobBytes } from "./blob";

const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb8_8320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function binaryBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  return concat([uint32(data.length), typeBytes, data, uint32(crc32(concat([typeBytes, data])))]);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return Uint8Array.from(deflateSync(bytes));
}

async function png(
  colorType: number,
  pixels: number[],
  options: { bitDepth?: number; interlace?: number; palette?: number[]; transparency?: number[] } = {},
): Promise<Uint8Array> {
  const header = concat([
    uint32(pixels.length ? 1 : 0),
    uint32(1),
    Uint8Array.of(options.bitDepth ?? 8, colorType, 0, 0, options.interlace ?? 0),
  ]);
  const chunks = [chunk("IHDR", header)];
  if (options.palette) chunks.push(chunk("PLTE", Uint8Array.from(options.palette)));
  if (options.transparency) chunks.push(chunk("tRNS", Uint8Array.from(options.transparency)));
  chunks.push(chunk("IDAT", await deflate(Uint8Array.of(0, ...pixels))), chunk("IEND", new Uint8Array()));
  return concat([signature, ...chunks]);
}

describe("纯 TypeScript PNG 解码", () => {
  it("短暂不可读的文件会自动重试", async () => {
    class TemporarilyUnreadableBlob extends Blob {
      reads = 0;

      override async arrayBuffer(): Promise<ArrayBuffer> {
        this.reads += 1;
        if (this.reads < 3) throw new DOMException("暂时不可读", "NotReadableError");
        return super.arrayBuffer();
      }
    }

    const blob = new TemporarilyUnreadableBlob([Uint8Array.of(1, 2, 3)]);
    await expect(readBlobBytes(blob)).resolves.toEqual(Uint8Array.of(1, 2, 3));
    expect(blob.reads).toBe(3);
  });

  it.each([
    [0, [50], [50, 50, 50, 255]],
    [2, [10, 20, 30], [10, 20, 30, 255]],
    [4, [40, 128], [40, 40, 40, 128]],
    [6, [1, 2, 3, 4], [1, 2, 3, 4]],
  ])("解码 8-bit 色型 %i", async (colorType, pixels, expected) => {
    const decoded = await decodePng(binaryBlob(await png(colorType, pixels)), `type-${colorType}.png`);
    expect(decoded.rgba).toEqual(Uint8Array.from(expected));
  });

  it("应用 PLTE 与 tRNS", async () => {
    const bytes = await png(3, [1], { palette: [10, 20, 30, 40, 50, 60], transparency: [255, 7] });
    expect((await decodePng(binaryBlob(bytes), "indexed.png")).rgba).toEqual(Uint8Array.of(40, 50, 60, 7));
  });

  it("拒绝损坏 CRC", async () => {
    const bytes = await png(6, [1, 2, 3, 4]);
    bytes[20] ^= 1;
    await expect(decodePng(binaryBlob(bytes), "bad-crc.png")).rejects.toThrow(/CRC/);
  });

  it("拒绝 16-bit 与 Adam7", async () => {
    await expect(decodePng(binaryBlob(await png(0, [0, 0], { bitDepth: 16 })), "16-bit.png")).rejects.toThrow(/16-bit/);
    await expect(decodePng(binaryBlob(await png(0, [0], { interlace: 1 })), "adam7.png")).rejects.toThrow(/Adam7/);
  });

  it("拒绝未知关键块", async () => {
    const bytes = await png(0, [0]);
    const critical = chunk("ABCD", new Uint8Array());
    const withCritical = concat([bytes.subarray(0, 33), critical, bytes.subarray(33)]);
    await expect(decodePng(binaryBlob(withCritical), "critical.png")).rejects.toThrow(/未知关键块/);
  });
});
