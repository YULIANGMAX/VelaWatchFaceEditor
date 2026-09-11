import {
  type DeviceBinaryDefinition,
  type DeviceBinaryHeaderField,
  type DeviceDataSourceDefinition,
  type DeviceDefinition,
  type DeviceManifestCapabilities,
  type DeviceProfile,
  type DeviceType,
} from "./types";

const modules = import.meta.glob("./devices/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const dataSourceCatalogModules = import.meta.glob("./data-sources/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObject(value: unknown, location: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${location} 必须是 JSON 对象`);
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], location: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${location} 包含未知字段：${unknown.join("、")}`);
}

function assertString(value: unknown, location: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} 必须是非空字符串`);
}

function assertStringArray(value: unknown, location: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${location} 必须是非空字符串组成的数组`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${location} 不得包含重复项`);
}

function assertPositiveInteger(value: unknown, location: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${location} 必须是正整数`);
}

function assertNonNegativeInteger(value: unknown, location: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${location} 必须是非负整数`);
}

function assertHex(value: unknown, bytes: number | null, location: string): asserts value is string {
  if (typeof value !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error(`${location} 必须是不带 0x 的偶数字节十六进制字符串`);
  }
  if (bytes !== null && value.length !== bytes * 2) throw new Error(`${location} 必须恰好为 ${bytes} 字节`);
}

function parseBinary(value: unknown, location: string): DeviceBinaryDefinition {
  assertObject(value, location);
  assertKeys(value, ["header", "resourceEncoding"], location);
  assertObject(value.header, `${location}.header`);
  assertKeys(value.header, ["size", "combinationFlagsBase", "fixedFields"], `${location}.header`);
  assertPositiveInteger(value.header.size, `${location}.header.size`);
  assertNonNegativeInteger(value.header.combinationFlagsBase, `${location}.header.combinationFlagsBase`);
  if (value.header.combinationFlagsBase > 0xffff) {
    throw new Error(`${location}.header.combinationFlagsBase 超出 uint16 范围`);
  }
  if (value.header.size < 0xa8) throw new Error(`${location}.header.size 不得小于 168 字节`);
  if (!Array.isArray(value.header.fixedFields)) throw new Error(`${location}.header.fixedFields 必须是数组`);

  const fields: DeviceBinaryHeaderField[] = value.header.fixedFields.map((entry, index) => {
    const fieldLocation = `${location}.header.fixedFields[${index}]`;
    assertObject(entry, fieldLocation);
    assertKeys(entry, ["offset", "encoding", "value"], fieldLocation);
    assertNonNegativeInteger(entry.offset, `${fieldLocation}.offset`);
    if (entry.encoding === "hex") {
      assertHex(entry.value, null, `${fieldLocation}.value`);
      return { offset: entry.offset, encoding: "hex", value: entry.value.toUpperCase() };
    }
    if (entry.encoding !== "uint8" && entry.encoding !== "uint16le" && entry.encoding !== "uint32le") {
      throw new Error(`${fieldLocation}.encoding 不受支持`);
    }
    assertNonNegativeInteger(entry.value, `${fieldLocation}.value`);
    const maximum = entry.encoding === "uint8" ? 0xff : entry.encoding === "uint16le" ? 0xffff : 0xffffffff;
    if (entry.value > maximum) throw new Error(`${fieldLocation}.value 超出 ${entry.encoding} 范围`);
    return { offset: entry.offset, encoding: entry.encoding, value: entry.value };
  });

  const occupied = new Set<number>();
  for (const [index, field] of fields.entries()) {
    const length = field.encoding === "hex" ? field.value.length / 2 : field.encoding === "uint8" ? 1 : field.encoding === "uint16le" ? 2 : 4;
    if (field.offset + length > value.header.size) throw new Error(`${location}.header.fixedFields[${index}] 超出头部范围`);
    for (let offset = field.offset; offset < field.offset + length; offset += 1) {
      if (offset >= 0x18 && offset < 0xa8) throw new Error(`${location}.header.fixedFields[${index}] 覆盖项目动态头字段`);
      if (occupied.has(offset)) throw new Error(`${location}.header.fixedFields 存在重叠字段`);
      occupied.add(offset);
    }
  }
  assertObject(value.resourceEncoding, `${location}.resourceEncoding`);
  assertKeys(value.resourceEncoding, [
    "imageValuesParameterMode", "imageValuesParameterDefault", "progressParameterDefault", "indexed8Dithering", "imageArrayIndexed8Dithering",
  ], `${location}.resourceEncoding`);
  for (const key of ["indexed8Dithering", "imageArrayIndexed8Dithering"] as const) {
    if (value.resourceEncoding[key] !== "nearest" && value.resourceEncoding[key] !== "floyd-steinberg") {
      throw new Error(`${location}.resourceEncoding.${key} 无效`);
    }
  }
  if (value.resourceEncoding.imageValuesParameterMode !== "fixed" && value.resourceEncoding.imageValuesParameterMode !== "attribute") {
    throw new Error(`${location}.resourceEncoding.imageValuesParameterMode 无效`);
  }
  assertNonNegativeInteger(value.resourceEncoding.imageValuesParameterDefault, `${location}.resourceEncoding.imageValuesParameterDefault`);
  if (value.resourceEncoding.imageValuesParameterDefault > 0xffff) {
    throw new Error(`${location}.resourceEncoding.imageValuesParameterDefault 超出 uint16 范围`);
  }
  assertNonNegativeInteger(value.resourceEncoding.progressParameterDefault, `${location}.resourceEncoding.progressParameterDefault`);
  if (value.resourceEncoding.progressParameterDefault > 0xffff) {
    throw new Error(`${location}.resourceEncoding.progressParameterDefault 超出 uint16 范围`);
  }
  return {
    header: {
      size: value.header.size,
      combinationFlagsBase: value.header.combinationFlagsBase,
      fixedFields: fields,
    },
    resourceEncoding: {
      imageValuesParameterMode: value.resourceEncoding.imageValuesParameterMode,
      imageValuesParameterDefault: value.resourceEncoding.imageValuesParameterDefault,
      progressParameterDefault: value.resourceEncoding.progressParameterDefault,
      indexed8Dithering: value.resourceEncoding.indexed8Dithering as "nearest" | "floyd-steinberg",
      imageArrayIndexed8Dithering: value.resourceEncoding.imageArrayIndexed8Dithering as "nearest" | "floyd-steinberg",
    },
  };
}

function parseDataSourceCatalogs(): Readonly<Record<string, Record<string, string>>> {
  return Object.fromEntries(Object.entries(dataSourceCatalogModules).map(([path, value]) => {
    const location = `数据源目录 ${path}`;
    assertObject(value, location);
    assertKeys(value, ["schemaVersion", "name", "codes"], location);
    if (value.schemaVersion !== 1) throw new Error(`${location}.schemaVersion 目前只支持 1`);
    assertString(value.name, `${location}.name`);
    const fileName = path.split("/").at(-1)?.replace(/\.json$/i, "");
    if (fileName !== value.name) throw new Error(`${location} 的文件名必须是 ${value.name}.json`);
    assertObject(value.codes, `${location}.codes`);
    const codes: Record<string, string> = {};
    for (const [name, code] of Object.entries(value.codes)) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`${location}.codes 的数据源名称无效：${name}`);
      assertHex(code, 2, `${location}.codes.${name}`);
      codes[name] = code.toUpperCase();
    }
    return [value.name, codes];
  }));
}

const DATA_SOURCE_CATALOGS = parseDataSourceCatalogs();

function parseDataSources(value: unknown, location: string): DeviceDataSourceDefinition {
  assertObject(value, location);
  assertKeys(value, ["catalog", "policy", "include", "exclude", "allowRawCodes", "codeOverrides", "verification"], location);
  assertString(value.catalog, `${location}.catalog`);
  const catalog = DATA_SOURCE_CATALOGS[value.catalog];
  if (!catalog) throw new Error(`${location}.catalog 引用了不存在的数据源目录 ${value.catalog}`);
  if (value.policy !== "all-known" && value.policy !== "allow-list") {
    throw new Error(`${location}.policy 只能是 all-known 或 allow-list`);
  }
  const include = value.include;
  const exclude = value.exclude;
  assertStringArray(include, `${location}.include`);
  assertStringArray(exclude, `${location}.exclude`);
  if (typeof value.allowRawCodes !== "boolean") throw new Error(`${location}.allowRawCodes 必须是布尔值`);
  assertObject(value.codeOverrides, `${location}.codeOverrides`);
  const codeOverrides: Record<string, string> = {};
  for (const [name, code] of Object.entries(value.codeOverrides)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`${location}.codeOverrides 的数据源名称无效：${name}`);
    assertHex(code, 2, `${location}.codeOverrides.${name}`);
    codeOverrides[name] = code.toUpperCase();
  }
  if (value.verification !== "verified" && value.verification !== "unverified") {
    throw new Error(`${location}.verification 只能是 verified 或 unverified`);
  }
  if (value.policy === "allow-list" && include.length === 0) {
    throw new Error(`${location}.policy 为 allow-list 时 include 不得为空`);
  }
  const duplicated = include.filter((entry) => exclude.includes(entry));
  if (duplicated.length > 0) throw new Error(`${location} 同时允许并排除了：${duplicated.join("、")}`);
  const codes = { ...catalog, ...codeOverrides };
  const unknownEntries = [...include, ...exclude].filter((entry) => !codes[entry]);
  if (unknownEntries.length > 0) throw new Error(`${location} 引用了目录中不存在的数据源：${unknownEntries.join("、")}`);
  return {
    catalog: value.catalog,
    policy: value.policy,
    include: [...include],
    exclude: [...exclude],
    allowRawCodes: value.allowRawCodes,
    codeOverrides,
    codes,
    verification: value.verification,
  };
}

function parseManifestCapabilities(value: unknown, location: string): DeviceManifestCapabilities {
  assertObject(value, location);
  assertKeys(value, ["resourceTypes", "attributes"], location);
  const resourceTypes = value.resourceTypes;
  assertObject(resourceTypes, `${location}.resourceTypes`);
  assertKeys(resourceTypes, ["policy", "include", "exclude"], `${location}.resourceTypes`);
  if (resourceTypes.policy !== "all-format" && resourceTypes.policy !== "allow-list") {
    throw new Error(`${location}.resourceTypes.policy 只能是 all-format 或 allow-list`);
  }
  const include = resourceTypes.include;
  const exclude = resourceTypes.exclude;
  assertStringArray(include, `${location}.resourceTypes.include`);
  assertStringArray(exclude, `${location}.resourceTypes.exclude`);
  const overlap = include.filter((type) => exclude.includes(type));
  if (overlap.length > 0) throw new Error(`${location}.resourceTypes 同时允许并排除了：${overlap.join("、")}`);
  if (resourceTypes.policy === "allow-list" && include.length === 0) {
    throw new Error(`${location}.resourceTypes.policy 为 allow-list 时 include 不得为空`);
  }
  assertObject(value.attributes, `${location}.attributes`);
  assertKeys(value.attributes, ["policy", "include", "exclude", "values"], `${location}.attributes`);
  if (value.attributes.policy !== "all-format" && value.attributes.policy !== "allow-list") {
    throw new Error(`${location}.attributes.policy 只能是 all-format 或 allow-list`);
  }
  assertObject(value.attributes.include, `${location}.attributes.include`);
  assertObject(value.attributes.exclude, `${location}.attributes.exclude`);
  assertObject(value.attributes.values, `${location}.attributes.values`);
  const attributeIncludes: Record<string, string[]> = {};
  for (const [target, attributes] of Object.entries(value.attributes.include)) {
    assertString(target, `${location}.attributes.include 的目标名称`);
    assertStringArray(attributes, `${location}.attributes.include.${target}`);
    attributeIncludes[target] = [...attributes];
  }
  const attributeExclusions: Record<string, string[]> = {};
  for (const [target, attributes] of Object.entries(value.attributes.exclude)) {
    assertString(target, `${location}.attributes.exclude 的目标名称`);
    assertStringArray(attributes, `${location}.attributes.exclude.${target}`);
    attributeExclusions[target] = [...attributes];
  }
  const attributeValues: Record<string, Record<string, string[]>> = {};
  for (const [target, constraints] of Object.entries(value.attributes.values)) {
    assertString(target, `${location}.attributes.values 的目标名称`);
    assertObject(constraints, `${location}.attributes.values.${target}`);
    attributeValues[target] = {};
    for (const [attribute, values] of Object.entries(constraints)) {
      assertString(attribute, `${location}.attributes.values.${target} 的属性名称`);
      assertStringArray(values, `${location}.attributes.values.${target}.${attribute}`);
      if (values.length === 0) throw new Error(`${location}.attributes.values.${target}.${attribute} 不得为空`);
      attributeValues[target][attribute] = [...values];
    }
  }
  return {
    resourceTypes: {
      policy: resourceTypes.policy,
      include: [...include],
      exclude: [...exclude],
    },
    attributes: {
      policy: value.attributes.policy,
      include: attributeIncludes,
      exclude: attributeExclusions,
      values: attributeValues,
    },
  };
}

function parseDefinition(path: string, value: unknown): DeviceDefinition {
  const location = `设备定义 ${path}`;
  assertObject(value, location);
  assertKeys(value, ["$schema", "schemaVersion", "deviceType", "name", "system", "display", "manifest", "binary", "dataSources"], location);
  if (value.$schema !== undefined) assertString(value.$schema, `${location}.$schema`);
  if (value.schemaVersion !== 2) throw new Error(`${location}.schemaVersion 目前只支持 2`);
  assertString(value.deviceType, `${location}.deviceType`);
  if (!/^[A-Z][A-Z0-9]*$/.test(value.deviceType)) throw new Error(`${location}.deviceType 必须使用大写设备编码`);
  const fileName = path.split("/").at(-1)?.replace(/\.json$/i, "");
  if (fileName !== value.deviceType) throw new Error(`${location} 的文件名必须是 ${value.deviceType}.json`);
  assertString(value.name, `${location}.name`);
  if (value.system !== "vela") throw new Error(`${location}.system 只能是 vela`);

  assertObject(value.display, `${location}.display`);
  assertKeys(value.display, ["width", "height", "cornerRadius"], `${location}.display`);
  assertPositiveInteger(value.display.width, `${location}.display.width`);
  assertPositiveInteger(value.display.height, `${location}.display.height`);
  assertNonNegativeInteger(value.display.cornerRadius, `${location}.display.cornerRadius`);

  return {
    $schema: value.$schema as string | undefined,
    schemaVersion: 2,
    deviceType: value.deviceType,
    name: value.name,
    system: "vela",
    display: {
      width: value.display.width,
      height: value.display.height,
      cornerRadius: value.display.cornerRadius,
    },
    manifest: parseManifestCapabilities(value.manifest, `${location}.manifest`),
    binary: parseBinary(value.binary, `${location}.binary`),
    dataSources: parseDataSources(value.dataSources, `${location}.dataSources`),
  };
}

export const DEVICE_DEFINITIONS: readonly DeviceDefinition[] = Object.entries(modules)
  .map(([path, value]) => parseDefinition(path, value))
  .sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }));

const duplicateTypes = DEVICE_DEFINITIONS
  .map((definition) => definition.deviceType)
  .filter((deviceType, index, values) => values.indexOf(deviceType) !== index);
if (duplicateTypes.length > 0) throw new Error(`设备编码重复：${duplicateTypes.join("、")}`);

export const DEVICE_PROFILES: readonly DeviceProfile[] = DEVICE_DEFINITIONS.map((definition) => ({
  id: definition.deviceType,
  label: definition.name,
  width: definition.display.width,
  height: definition.display.height,
  radius: definition.display.cornerRadius,
  system: definition.system,
  manifest: definition.manifest,
  binary: definition.binary,
  dataSources: definition.dataSources,
}));

export const DEVICE_PROFILE_MAP: Readonly<Record<DeviceType, DeviceProfile>> = Object.fromEntries(
  DEVICE_PROFILES.map((profile) => [profile.id, profile]),
);

export const DEVICE_SIZES: Readonly<Record<DeviceType, { width: number; height: number; radius: number }>> = Object.fromEntries(
  DEVICE_PROFILES.map((profile) => [profile.id, {
    width: profile.width,
    height: profile.height,
    radius: profile.radius,
  }]),
);

export function findDeviceProfile(device: string): DeviceProfile | undefined {
  return DEVICE_PROFILE_MAP[device];
}

export function getDeviceProfile(device: DeviceType): DeviceProfile {
  const profile = findDeviceProfile(device);
  if (!profile) throw new Error(`不支持设备 ${device}`);
  return profile;
}

export function getDeviceDefinition(device: DeviceType): DeviceDefinition {
  const definition = DEVICE_DEFINITIONS.find((entry) => entry.deviceType === device);
  if (!definition) throw new Error(`不支持设备 ${device}`);
  return definition;
}

export function isDataSourceSupported(device: DeviceType, source: string): boolean {
  const capability = getDeviceProfile(device).dataSources;
  if (/^[0-9a-fA-F]+$/.test(source)) return capability.allowRawCodes && source.length === 4;
  if (!capability.codes[source]) return false;
  if (capability.exclude.includes(source)) return false;
  return capability.policy === "all-known" || capability.include.includes(source);
}

export function supportsManifestResource(definition: DeviceDefinition, resourceType: string): boolean {
  const capability = definition.manifest.resourceTypes;
  if (capability.exclude.includes(resourceType)) return false;
  return capability.policy === "all-format" || capability.include.includes(resourceType);
}

export function supportsManifestAttribute(definition: DeviceDefinition, target: string, attribute: string): boolean {
  const capability = definition.manifest.attributes;
  if ((capability.exclude[target] ?? []).includes(attribute)) return false;
  return capability.policy === "all-format" || (capability.include[target] ?? []).includes(attribute);
}

export function supportsManifestAttributeValue(
  definition: DeviceDefinition,
  target: string,
  attribute: string,
  value: string,
): boolean {
  const allowed = definition.manifest.attributes.values[target]?.[attribute];
  if (!allowed) return true;
  if (allowed.includes(value)) return true;
  if (attribute === "compressMethod" && value.toLowerCase() === "none" && allowed.includes("none")) {
    return true;
  }
  return false;
}

export function manifestAttributeAllowedValues(
  definition: DeviceDefinition,
  target: string,
  attribute: string,
): readonly string[] | undefined {
  return definition.manifest.attributes.values[target]?.[attribute];
}

export function isManifestResourceSupported(device: DeviceType, resourceType: string): boolean {
  return supportsManifestResource(getDeviceDefinition(device), resourceType);
}

export function isManifestAttributeSupported(device: DeviceType, target: string, attribute: string): boolean {
  return supportsManifestAttribute(getDeviceDefinition(device), target, attribute);
}

export function isManifestAttributeValueSupported(
  device: DeviceType,
  target: string,
  attribute: string,
  value: string,
): boolean {
  return supportsManifestAttributeValue(getDeviceDefinition(device), target, attribute, value);
}

export function getManifestAttributeAllowedValues(
  device: DeviceType,
  target: string,
  attribute: string,
): readonly string[] | undefined {
  return manifestAttributeAllowedValues(getDeviceDefinition(device), target, attribute);
}
