import { useEffect, useRef } from "react";
import { numericMetric } from "../../core/metrics";
import {
  getResourceName,
  type ProjectAsset,
  type WatchfacePreviewContext,
  type WatchfaceProject,
  type WatchfaceResource,
} from "../../core/model";

const resourceNameIndexCache = new WeakMap<WatchfaceProject, Map<string, WatchfaceResource[]>>();

function resourceNameIndex(project: WatchfaceProject): Map<string, WatchfaceResource[]> {
  let index = resourceNameIndexCache.get(project);
  if (index) return index;
  index = new Map<string, WatchfaceResource[]>();
  for (const resource of project.resources) {
    const name = getResourceName(resource);
    if (!name) continue;
    const matches = index.get(name);
    if (matches) matches.push(resource);
    else index.set(name, [resource]);
  }
  resourceNameIndexCache.set(project, index);
  return index;
}

export function numberAttr(resource: WatchfaceResource, key: string, fallback = 0): number {
  const value = Number(resource.attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function findResource(project: WatchfaceProject, name: string, color = ""): WatchfaceResource | undefined {
  const matches = resourceNameIndex(project).get(name) ?? [];
  if (!color) return matches.find((resource) => !resource.attrs.colorGroup) ?? matches[0];
  return matches.find((resource) => resource.attrs.colorGroup?.toLowerCase() === color.toLowerCase())
    ?? matches.find((resource) => !resource.attrs.colorGroup)
    ?? matches[0];
}

export function imageAsset(project: WatchfaceProject, path: string | undefined): ProjectAsset | undefined {
  if (!path) return undefined;
  return project.assets[path.replaceAll("\\", "/")];
}

export function Placeholder({ label }: { label: string }) {
  return <div className="resource-placeholder">{label}</div>;
}

function RecoloredBitmap({ asset, color }: { asset: ProjectAsset; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const red = Number.parseInt(color.slice(1, 3), 16) / 255;
      const green = Number.parseInt(color.slice(3, 5), 16) / 255;
      const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] *= red;
        pixels.data[index + 1] *= green;
        pixels.data[index + 2] *= blue;
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = asset.url;
    return () => { image.onload = null; };
  }, [asset.url, color]);
  return <canvas ref={canvasRef} className="resource-image" />;
}

export function Bitmap({ asset, color }: { asset: ProjectAsset; color?: string }) {
  return color ? <RecoloredBitmap asset={asset} color={color} /> : <img className="resource-image" src={asset.url} draggable={false} alt="" />;
}

export function recolorFor(project: WatchfaceProject, resource: WatchfaceResource, preview: WatchfacePreviewContext): string | undefined {
  const colors = (project.watchface.recolorTable ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  return resource.attrs.recolorEnable === "true" && colors.includes(preview.color.toLowerCase()) ? preview.color : undefined;
}

function dataItemVisible(resource: WatchfaceResource, now: Date, preview: WatchfacePreviewContext): boolean {
  if (resource.attrs.renderRule === "hideWhenUnitMismatch") {
    if (resource.attrs.source === "weatherCurrentTemperatureFahrenheit") return preview.temperatureUnit === "fahrenheit";
    if (resource.attrs.source === "weatherCurrentTemperature") return preview.temperatureUnit === "celsius";
    return true;
  }
  if (resource.attrs.renderRule !== "hideWhenOutRange") return true;
  if (!resource.attrs.valueRange && !resource.attrs.valueRangeSource) return true;
  const start = resource.attrs.valueStartSource ? numericMetric(resource.attrs.valueStartSource, now, preview.metrics) : numberAttr(resource, "valueStart");
  const range = resource.attrs.valueRangeSource ? numericMetric(resource.attrs.valueRangeSource, now, preview.metrics) : numberAttr(resource, "valueRange");
  const value = numericMetric(resource.attrs.source, now, preview.metrics);
  return value >= start && value <= start + range;
}

export function resourceVisibleInPreview(resource: WatchfaceResource, now: Date, preview: WatchfacePreviewContext): boolean {
  return !resource.type.startsWith("DataItem") || dataItemVisible(resource, now, preview);
}

export function ImageView({ project, resource, preview, ignoreRecolor = false }: { project: WatchfaceProject; resource: WatchfaceResource; preview: WatchfacePreviewContext; ignoreRecolor?: boolean }) {
  const asset = imageAsset(project, resource.attrs.src);
  if (!asset) return <Placeholder label={resource.attrs.src || "缺少图片"} />;
  return <Bitmap asset={asset} color={ignoreRecolor ? undefined : recolorFor(project, resource, preview)} />;
}

export function ArrayFrame({ project, resource, index, preview }: { project: WatchfaceProject; resource: WatchfaceResource; index: number; preview: WatchfacePreviewContext }) {
  const frame = resource.children[index] ?? resource.children[0];
  const asset = imageAsset(project, frame?.attrs.src);
  if (!asset) return <Placeholder label={frame?.attrs.src || "空图片序列"} />;
  return <Bitmap asset={asset} color={recolorFor(project, resource, preview)} />;
}
