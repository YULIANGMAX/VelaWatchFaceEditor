import {
  isManifestAttributeSupported,
  isManifestResourceSupported,
  type DeviceType,
} from "../device-definition";
import type { ResourceType } from "../core/model";

export function isDeviceResourceEditable(device: DeviceType, resourceType: ResourceType): boolean {
  return isManifestResourceSupported(device, resourceType);
}

export function isDeviceAttributeEditable(device: DeviceType, target: string, attribute: string): boolean {
  return isManifestAttributeSupported(device, target, attribute);
}
