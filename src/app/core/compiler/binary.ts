const textEncoder = new TextEncoder();

export class BinaryWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  writeUint8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  writeInt8(value: number): void {
    this.writeUint8(value);
  }

  writeUint16(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  writeInt16(value: number): void {
    this.writeUint16(value);
  }

  writeUint24(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff);
  }

  writeUint32(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  writeInt32(value: number): void {
    this.writeUint32(value);
  }

  writeFloat32(value: number): void {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    this.writeBytes(bytes);
  }

  writeBytes(value: ArrayLike<number>): void {
    for (let index = 0; index < value.length; index += 1) this.bytes.push(value[index] & 0xff);
  }

  writeUtf8(value: string, fixedLength?: number): void {
    const encoded = textEncoder.encode(value);
    if (fixedLength === undefined) {
      this.writeBytes(encoded);
      return;
    }
    this.writeBytes(encoded.subarray(0, fixedLength));
    this.pad(Math.max(0, fixedLength - encoded.length));
  }

  pad(length: number, value = 0): void {
    for (let index = 0; index < length; index += 1) this.bytes.push(value & 0xff);
  }

  align(alignment: number): void {
    const remainder = this.length % alignment;
    if (remainder) this.pad(alignment - remainder);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
}

export function writeInt16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt16(offset, value, true);
}

export function writeUint24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

export function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

export function writeInt32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(offset, value, true);
}

export function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

export function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

export function assertUnsigned(value: number, bits: 8 | 16 | 24 | 32, label: string): void {
  const maximum = bits === 32 ? 0xffff_ffff : 2 ** bits - 1;
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} 必须是 ${bits} 位无符号整数，当前为 ${value}`);
  }
}

export function assertSigned(value: number, bits: 8 | 16 | 32, label: string): void {
  const minimum = -(2 ** (bits - 1));
  const maximum = 2 ** (bits - 1) - 1;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} 必须是 ${bits} 位有符号整数，当前为 ${value}`);
  }
}

