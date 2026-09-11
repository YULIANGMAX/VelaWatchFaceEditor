import type { DeviceDataSourceDefinition } from "../../device-definition";
import { JUMP_APPS, TRANSLATION_LANGUAGES } from "../../format-definition/manifestFormat";

export { TRANSLATION_LANGUAGES };

export const ALIGN_CODES: Readonly<Record<string, number>> = { right: 0, left: 1, center: 2 };
export const TEXT_ALIGN_CODES: Readonly<Record<string, number>> = { left: 0, center: 1, right: 2 };
export const RENDER_RULE_CODES: Readonly<Record<string, number>> = {
  alwaysShow: 0, hideWhenUnitMismatch: 2, hideWhenOutRange: 4,
};

export const JUMP_APP_CODES: Readonly<Record<string, number>> = {
  pressure: 0x1032, breath: 0x1042, heartrate: 0x1052, sleep: 0x10c2, SpO2: 0x10e2,
  sport: 0x10f2, activities: 0x1132, media: 0x1152, settings: 0x1162, compass: 0x1182,
  flashlight: 0x11a2, calendar: 0x11b2, remoteCamera: 0x11c2, sportsRecord: 0x11d2,
  alipay: 0x11e2, womenHealth: 0x11f2, chronograph: 0x1202, weather: 0x1212,
  phone: 0x1232, wxpay: 0x1252, timer: 0x1262, findPhone: 0x1272, alarm: 0x1282,
  recorder: 0x1292, barometer: 0x12a2, nfcCard: 0x12b2, voiceAssistant: 0x12d2,
  contact: 0x12e2, sportsCourse: 0x12f2, temperature: 0x1302, share: 0x1312,
  bloodPressure: 0x1342, ECG: 0x1352, vitalityValue: 0x1362, jsApplication: 0x1372,
  luaApplication: 0x1382, trainingStatus: 0x1392, todo: 0x13c2, miJia: 0x13f2,
  glucose: 0x1422, sms: 0x1462, worldclock: 0x13b2, perpetualcalendar: 0x1452,
  amap: 0x1472, intercom: 0x14e2, navigation: 0x1482, research: 0x1512, wechat: 0x1ff2,
};

const missingJumpAppCodes = JUMP_APPS.filter((name) => JUMP_APP_CODES[name] === undefined);
const unknownJumpAppCodes = Object.keys(JUMP_APP_CODES).filter((name) => !JUMP_APPS.includes(name));
if (missingJumpAppCodes.length > 0 || unknownJumpAppCodes.length > 0) {
  throw new Error(`jumpApp 格式定义与编译映射不一致：缺少 ${missingJumpAppCodes.join(",") || "无"}；多余 ${unknownJumpAppCodes.join(",") || "无"}`);
}

export function parseHexBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) throw new Error(`十六进制数据必须为偶数长度：${value}`);
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

export function encodeDataSource(source: string, definition: DeviceDataSourceDefinition): Uint8Array {
  const rawCode = /^(?:[0-9a-fA-F]{2})+$/.test(source);
  if (rawCode && !definition.allowRawCodes) throw new Error(`设备不允许直接使用十六进制数据源：${source}`);
  const code = rawCode ? source : definition.codeOverrides[source] ?? definition.codes[source];
  if (!code) throw new Error(`设备数据源定义中不存在：${source}`);
  if (!rawCode && (definition.exclude.includes(source)
    || (definition.policy === "allow-list" && !definition.include.includes(source)))) {
    throw new Error(`设备不支持数据源：${source}`);
  }
  const bytes = parseHexBytes(code);
  if (bytes.length !== 2) throw new Error(`此资源的数据源必须编码为 2 字节：${source}`);
  return bytes;
}
