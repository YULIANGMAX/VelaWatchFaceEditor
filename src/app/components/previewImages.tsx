import { createRoot, type Root } from "react-dom/client";
import { getDeviceDefinition, getResourceName, refName, type WatchfacePreviewContext, type WatchfaceProject } from "../core/model";
import { ResourceRenderer } from "./ResourceRenderer";

export interface ThemePreviewImage {
  themeId: string;
  resourceName: string;
  fileName: string;
  blob: Blob;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function inlineStyles(source: HTMLElement, target: HTMLElement): void {
  const computed = window.getComputedStyle(source);
  for (const property of Array.from(computed)) {
    target.style.setProperty(property, computed.getPropertyValue(property));
  }
}

async function imageToDataUrl(image: HTMLImageElement): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 2D 上下文");
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function cloneWithStyles(source: HTMLElement): Promise<HTMLElement> {
  const clone = source.cloneNode(true) as HTMLElement;
  const stack: Array<[HTMLElement, HTMLElement]> = [[source, clone]];
  while (stack.length > 0) {
    const [origin, copy] = stack.pop()!;
    inlineStyles(origin, copy);
    if (origin instanceof HTMLCanvasElement) {
      const image = document.createElement("img");
      image.src = origin.toDataURL();
      image.alt = "";
      copy.replaceWith(image);
      continue;
    }
    if (origin instanceof HTMLImageElement) {
      const image = copy as HTMLImageElement;
      image.src = await imageToDataUrl(origin);
      image.alt = "";
      continue;
    }
    const originChildren = Array.from(origin.children) as HTMLElement[];
    const copyChildren = Array.from(copy.children) as HTMLElement[];
    for (let index = 0; index < originChildren.length; index += 1) {
      if (copyChildren[index]) stack.push([originChildren[index], copyChildren[index]]);
    }
  }
  return clone;
}

function clipRoundedRect(context: CanvasRenderingContext2D, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(width - radius, 0);
  context.quadraticCurveTo(width, 0, width, radius);
  context.lineTo(width, height - radius);
  context.quadraticCurveTo(width, height, width - radius, height);
  context.lineTo(radius, height);
  context.quadraticCurveTo(0, height, 0, height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.clip();
}

async function nodeToPng(node: HTMLElement, width: number, height: number, cornerRadius: number): Promise<Blob> {
  const clone = await cloneWithStyles(node);
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${markup}</div></foreignObject></svg>`;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("预览图渲染失败"));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 2D 上下文");
  clipRoundedRect(context, width, height, cornerRadius);
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 导出失败"))), "image/png");
  });
}

export async function generateThemePreviews(project: WatchfaceProject): Promise<ThemePreviewImage[]> {
  const width = project.canvas.width;
  const height = project.canvas.height;
  const cornerRadius = getDeviceDefinition(project.device).display.cornerRadius;
  const now = new Date();
  const preview: WatchfacePreviewContext = { color: "", elapsedMs: 0, temperatureUnit: "celsius", metrics: {} };

  const container = document.createElement("div");
  container.style.cssText = `position: fixed; left: -100000px; top: 0; width: ${width}px; height: ${height}px; pointer-events: none; z-index: -1;`;
  document.body.appendChild(container);

  let root: Root | null = null;
  try {
    root = createRoot(container);
    root.render(
      <div>
        {project.themes.map((theme) => (
          <div
            className="watchface-stage preview-stage"
            key={theme.id}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width,
              height,
              backgroundColor: theme.attrs.bgColor || "#000000",
            }}
          >
            {theme.layouts.map((layout) => {
              const resourceName = refName(layout.attrs.ref);
              const resource = project.resources.find((entry) => getResourceName(entry) === resourceName);
              const align = resource?.attrs.align;
              const anchor = align === "right" ? "translateX(-100%)" : align === "center" ? "translateX(-50%)" : undefined;
              return (
                <div
                  className="layout-node"
                  key={layout.id}
                  style={{
                    position: "absolute",
                    left: Number(layout.attrs.x || 0),
                    top: Number(layout.attrs.y || 0),
                    transform: anchor,
                  }}
                >
                  <ResourceRenderer project={project} resourceName={resourceName} now={now} preview={preview} />
                </div>
              );
            })}
          </div>
        ))}
      </div>,
    );

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await document.fonts.ready;
    await Promise.all(
      Array.from(container.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)),
    );

    const stages = Array.from(container.querySelectorAll<HTMLElement>(".preview-stage"));
    const results: ThemePreviewImage[] = [];
    for (let index = 0; index < project.themes.length; index += 1) {
      const theme = project.themes[index];
      const stage = stages[index];
      if (!theme || !stage) continue;
      const themeName = theme.attrs.name?.trim() || (theme.attrs.type === "AOD" ? "息屏" : `主题${index + 1}`);
      const kind = theme.attrs.type === "AOD" ? "aod" : "normal";
      const resourceName = `_preview_${sanitizeFileName(themeName)}_${kind}`;
      const fileName = `${resourceName}.png`;
      results.push({ themeId: theme.id, resourceName, fileName, blob: await nodeToPng(stage, width, height, cornerRadius) });
    }
    return results;
  } finally {
    root?.unmount();
    container.remove();
  }
}
