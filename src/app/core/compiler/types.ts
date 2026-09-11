import type {
  Attributes,
  Diagnostic,
  ManifestExtensionNode,
  WatchfaceResource,
  WatchfaceTheme,
} from "../model";
import type { DeviceDefinition } from "../../device-definition";

export interface CompileInput {
  projectVersion: string;
  watchface: Attributes;
  resources: WatchfaceResource[];
  themes: WatchfaceTheme[];
  manifestExtensions: ManifestExtensionNode[];
  assets: Record<string, Blob>;
  assetDimensions: Record<string, { width?: number; height?: number }>;
}

export interface CompileOptions {
  device: DeviceDefinition;
}

export type CompileStage = "prepare" | "decode-images" | "encode-resources" | "assemble";

export interface CompileProgress {
  stage: CompileStage;
  completed: number;
  total: number;
}

export interface CompileResult {
  bytes: Uint8Array;
  size: number;
  sha256: string;
  faceCount: number;
  resourceCount: number;
}

export type ProgressListener = (progress: CompileProgress) => void;

export class WatchfaceCompileError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = "WatchfaceCompileError";
    this.diagnostics = diagnostics;
  }
}
