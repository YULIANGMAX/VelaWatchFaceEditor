export type DeviceType = string;

export interface DeviceDisplayDefinition {
  width: number;
  height: number;
  cornerRadius: number;
}

export type DeviceBinaryHeaderField =
  | { offset: number; encoding: "hex"; value: string }
  | { offset: number; encoding: "uint8" | "uint16le" | "uint32le"; value: number };

export interface DeviceBinaryDefinition {
  header: {
    size: number;
    combinationFlagsBase: number;
    fixedFields: DeviceBinaryHeaderField[];
  };
  resourceEncoding: {
    imageValuesParameterMode: "fixed" | "attribute";
    imageValuesParameterDefault: number;
    progressParameterDefault: number;
    indexed8Dithering: "nearest" | "floyd-steinberg";
    imageArrayIndexed8Dithering: "nearest" | "floyd-steinberg";
  };
}

export interface DeviceDataSourceDefinition {
  catalog: string;
  policy: "all-known" | "allow-list";
  include: string[];
  exclude: string[];
  allowRawCodes: boolean;
  codeOverrides: Record<string, string>;
  codes: Record<string, string>;
  verification: "verified" | "unverified";
}

export interface DeviceManifestCapabilities {
  resourceTypes: {
    policy: "all-format" | "allow-list";
    include: string[];
    exclude: string[];
  };
  attributes: {
    policy: "all-format" | "allow-list";
    include: Record<string, string[]>;
    exclude: Record<string, string[]>;
    values: Record<string, Record<string, string[]>>;
  };
}

export interface DeviceDefinition {
  $schema?: string;
  schemaVersion: 2;
  deviceType: DeviceType;
  name: string;
  system: "vela";
  display: DeviceDisplayDefinition;
  manifest: DeviceManifestCapabilities;
  binary: DeviceBinaryDefinition;
  dataSources: DeviceDataSourceDefinition;
}

export interface DeviceProfile {
  id: DeviceType;
  label: string;
  width: number;
  height: number;
  radius: number;
  system: "vela";
  manifest: DeviceManifestCapabilities;
  binary: DeviceBinaryDefinition;
  dataSources: DeviceDataSourceDefinition;
}
