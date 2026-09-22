import { readUint16, readUint32 } from "./binary";
import type { DeviceDefinition } from "../../device-definition";

export const FACE_HEADER_SIZE = 0x58;
export const THEME_NAME_SIZE = 0x48;
export const FACE_RECORD_SIZE = FACE_HEADER_SIZE + THEME_NAME_SIZE;
export const ELEMENT_TYPE_COUNT = 10;
export const DESCRIPTOR_SIZE = 0x10;

export interface InspectedDescriptor {
  id: number;
  flags: number;
  type: number;
  offset: number;
  length: number;
}

export interface InspectedElementTable {
  type: number;
  count: number;
  offset: number;
  descriptors: InspectedDescriptor[];
}

export interface InspectedFace {
  offset: number;
  name: string;
  backgroundColor: number;
  aod: boolean;
  previewOffset: number;
  tables: InspectedElementTable[];
}

export interface InspectedWatchfaceBin {
  id: string;
  name: string;
  faceCount: number;
  colorCount: number;
  recolorCount: number;
  previewOffset: number;
  faces: InspectedFace[];
}

function ensureRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error(`${label} 越界：offset=0x${offset.toString(16)}, length=0x${length.toString(16)}`);
  }
}

function readZeroTerminatedUtf8(bytes: Uint8Array, offset: number, length: number): string {
  ensureRange(bytes, offset, length, "UTF-8 字符串");
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end));
}

export function inspectWatchfaceBin(bytes: Uint8Array, device: DeviceDefinition): InspectedWatchfaceBin {
  const globalHeaderSize = device.binary.header.size;
  ensureRange(bytes, 0, globalHeaderSize, "全局头");
  if (bytes[0] !== 0x5a || bytes[1] !== 0xa5 || bytes[2] !== 0x34 || bytes[3] !== 0x12) {
    throw new Error("不是受支持的小米表盘 BIN：文件魔数错误");
  }

  const colorCount = readUint32(bytes, 0x18) || bytes[0x1d];
  const recolorCount = bytes[0x1d];
  const colorTableLength = colorCount * 4;
  ensureRange(bytes, globalHeaderSize, colorTableLength, "颜色表");
  const faceCount = bytes[0x1c];
  const faceStart = globalHeaderSize + colorTableLength;
  const facesEnd = faceStart + faceCount * FACE_RECORD_SIZE;
  ensureRange(bytes, faceStart, faceCount * FACE_RECORD_SIZE, "主题记录区");

  const faces: InspectedFace[] = [];
  const tableRanges: Array<{ start: number; end: number; label: string }> = [];
  const resourceRanges: Array<{ start: number; end: number; label: string }> = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const faceOffset = faceStart + faceIndex * FACE_RECORD_SIZE;
    const tables: InspectedElementTable[] = [];
    for (let type = 0; type < ELEMENT_TYPE_COUNT; type += 1) {
      const count = readUint32(bytes, faceOffset + 8 + type * 8);
      const offset = readUint32(bytes, faceOffset + 12 + type * 8);
      if (count === 0) {
        if (offset !== 0 && (offset < facesEnd || offset > bytes.length)) {
          throw new Error(`主题 ${faceIndex} 的空 type-${type} 表偏移越界`);
        }
        tables.push({ type, count, offset, descriptors: [] });
        continue;
      }
      ensureRange(bytes, offset, count * DESCRIPTOR_SIZE, `主题 ${faceIndex} type-${type} 描述符表`);
      if (offset < facesEnd) throw new Error(`主题 ${faceIndex} type-${type} 描述符覆盖主题记录区`);
      tableRanges.push({ start: offset, end: offset + count * DESCRIPTOR_SIZE, label: `主题 ${faceIndex} type-${type} 描述符表` });
      const descriptors: InspectedDescriptor[] = [];
      for (let descriptorIndex = 0; descriptorIndex < count; descriptorIndex += 1) {
        const descriptorOffset = offset + descriptorIndex * DESCRIPTOR_SIZE;
        const dataOffset = readUint32(bytes, descriptorOffset + 8);
        const dataLength = readUint32(bytes, descriptorOffset + 12);
        ensureRange(bytes, dataOffset, dataLength, `主题 ${faceIndex} type-${type} 资源 ${descriptorIndex}`);
        if (bytes[descriptorOffset + 3] !== type) throw new Error(`主题 ${faceIndex} type-${type} 描述符的类型字段无效`);
        resourceRanges.push({ start: dataOffset, end: dataOffset + dataLength, label: `主题 ${faceIndex} type-${type} 资源 ${descriptorIndex}` });
        descriptors.push({
          id: readUint16(bytes, descriptorOffset),
          flags: bytes[descriptorOffset + 2],
          type: bytes[descriptorOffset + 3],
          offset: dataOffset,
          length: dataLength,
        });
      }
      tables.push({ type, count, offset, descriptors });
    }
    faces.push({
      offset: faceOffset,
      name: readZeroTerminatedUtf8(bytes, faceOffset + FACE_HEADER_SIZE, THEME_NAME_SIZE),
      backgroundColor: readUint32(bytes, faceOffset),
      aod: readUint32(bytes, faceOffset + FACE_RECORD_SIZE - 4) === 1,
      previewOffset: readUint32(bytes, faceOffset + 4),
      tables,
    });
  }

  for (let index = 0; index < tableRanges.length; index += 1) {
    const current = tableRanges[index]!;
    for (const other of tableRanges.slice(index + 1)) {
      if (current.start < other.end && other.start < current.end) throw new Error(`${current.label} 与 ${other.label} 重叠`);
    }
    for (const resource of resourceRanges) {
      if (current.start < resource.end && resource.start < current.end) throw new Error(`${current.label} 与 ${resource.label} 重叠`);
    }
  }
  for (let index = 0; index < resourceRanges.length; index += 1) {
    const current = resourceRanges[index]!;
    for (const other of resourceRanges.slice(index + 1)) {
      const overlaps = current.start < other.end && other.start < current.end;
      const identical = current.start === other.start && current.end === other.end;
      if (overlaps && !identical) throw new Error(`${current.label} 与 ${other.label} 部分重叠`);
    }
  }

  const validatePreview = (offset: number, label: string): void => {
    if (offset === 0) return;
    ensureRange(bytes, offset, 12, `${label}资源头`);
    ensureRange(bytes, offset, 12 + readUint32(bytes, offset + 8), label);
  };
  const previewOffset = readUint32(bytes, 0x20);
  validatePreview(previewOffset, "全局 preview ");
  faces.forEach((face, index) => validatePreview(face.previewOffset, `主题 ${index} preview `));

  return {
    id: readZeroTerminatedUtf8(bytes, 0x28, 0x40),
    name: readZeroTerminatedUtf8(bytes, 0x68, 0x40),
    faceCount,
    colorCount,
    recolorCount,
    previewOffset,
    faces,
  };
}
