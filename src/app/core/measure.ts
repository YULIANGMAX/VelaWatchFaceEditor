import {
  getResourceName,
  refName,
  type ProjectAsset,
  type WatchfaceResource,
} from "./model";

export interface ResourceDimensions {
  width: number;
  height: number;
}

/** 尺寸计算实际依赖的项目数据，不要求完整编辑器项目。 */
export interface ResourceMeasurementInput {
  resources: readonly WatchfaceResource[];
  assets: Readonly<Record<string, Pick<ProjectAsset, "width" | "height">>>;
}

function findResource(project: ResourceMeasurementInput, name: string, color = ""): WatchfaceResource | undefined {
  const matches = project.resources.filter((resource) => getResourceName(resource) === name);
  if (!color) return matches.find((resource) => !resource.attrs.colorGroup) ?? matches[0];
  return matches.find((resource) => resource.attrs.colorGroup?.toLowerCase() === color.toLowerCase())
    ?? matches.find((resource) => !resource.attrs.colorGroup)
    ?? matches[0];
}

function imageAsset(project: ResourceMeasurementInput, path: string | undefined): Pick<ProjectAsset, "width" | "height"> | undefined {
  if (!path) return undefined;
  return project.assets[path.replaceAll("\\", "/")];
}

function numberAttr(resource: WatchfaceResource, key: string, fallback = 0): number {
  const value = Number(resource.attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 获取子项资源的有效排版尺寸：若显式配置了 w/h 则优先使用配置值，否则使用递归测量值
 */
function getChildDimensions(
  project: ResourceMeasurementInput,
  childRes: WatchfaceResource | undefined,
  color: string,
  visited: Set<string>,
): ResourceDimensions {
  if (!childRes) return { width: 0, height: 0 };
  const explicitW = Number(childRes.attrs.w);
  const explicitH = Number(childRes.attrs.h);
  const measured = measureResource(project, childRes, color, visited);
  return {
    width: Number.isFinite(explicitW) && explicitW > 0 ? explicitW : measured.width,
    height: Number.isFinite(explicitH) && explicitH > 0 ? explicitH : measured.height,
  };
}

const measurementCache = new WeakMap<
  WatchfaceResource,
  WeakMap<object, Map<string, ResourceDimensions>>
>();

/**
 * 清理测绘缓存（供测试或全量重载时可选调用）
 */
export function clearMeasurementCache(): void {
  // WeakMap 随对象销毁自动回收，无残留
}

function measureResourceRaw(
  project: ResourceMeasurementInput,
  resource: WatchfaceResource,
  color: string,
  visited: Set<string>,
): ResourceDimensions {
  switch (resource.type) {
      case "Image": {
        const asset = imageAsset(project, resource.attrs.src);
        return {
          width: asset?.width || 0,
          height: asset?.height || 0,
        };
      }

      case "ImageArray": {
        let maxWidth = 0;
        let maxHeight = 0;
        for (const child of resource.children) {
          const asset = imageAsset(project, child.attrs.src);
          if (asset) {
            maxWidth = Math.max(maxWidth, asset.width || 0);
            maxHeight = Math.max(maxHeight, asset.height || 0);
          }
        }
        return { width: maxWidth, height: maxHeight };
      }

      case "Sprite": {
        const array = findResource(project, refName(resource.attrs.ref), color);
        return array ? measureResource(project, array, color, visited) : { width: 0, height: 0 };
      }

      case "DataItemImageNumber": {
        const arrayRes = findResource(project, refName(resource.attrs.ref), color);
        const arrayDim = arrayRes ? measureResource(project, arrayRes, color, visited) : { width: 0, height: 0 };
        const totalDigits = Math.max(1, numberAttr(resource, "totalDigits", 2));
        const decimalDigits = numberAttr(resource, "decimalDigits", 0);
        const space = numberAttr(resource, "space", 0);
        const decimalOffsetX = decimalDigits > 0 ? numberAttr(resource, "decimalOffsetX", 0) : 0;

        const totalChars = totalDigits;
        let numberWidth = totalChars * arrayDim.width + Math.max(0, totalChars - 1) * space + decimalOffsetX;
        let numberHeight = arrayDim.height;

        if (resource.attrs.unitIcon) {
          const unitRes = findResource(project, refName(resource.attrs.unitIcon), color);
          if (unitRes) {
            const unitDim = measureResource(project, unitRes, color, visited);
            numberWidth += unitDim.width + space;
            numberHeight = Math.max(numberHeight, unitDim.height);
          }
        }

        return {
          width: Math.max(0, Math.round(numberWidth)),
          height: Math.max(0, Math.round(numberHeight)),
        };
      }

      case "DataItemImageValues": {
        const arrayRes = findResource(project, refName(resource.attrs.ref), color);
        return arrayRes ? measureResource(project, arrayRes, color, visited) : { width: 0, height: 0 };
      }

      case "DataItemPointer": {
        const pointerRes = findResource(project, refName(resource.attrs.ref), color);
        const pointerDim = pointerRes ? measureResource(project, pointerRes, color, visited) : { width: 0, height: 0 };
        const bgRes = resource.attrs.background ? findResource(project, refName(resource.attrs.background), color) : undefined;
        const bgDim = bgRes ? measureResource(project, bgRes, color, visited) : { width: 0, height: 0 };
        return {
          width: Math.max(pointerDim.width, bgDim.width),
          height: Math.max(pointerDim.height, bgDim.height),
        };
      }

      case "DataItemArcProgressBar":
      case "DataItemLineProgressBar": {
        const foreground = findResource(project, refName(resource.attrs.ref), color);
        const background = resource.attrs.bg ? findResource(project, refName(resource.attrs.bg), color) : undefined;
        const foregroundDim = foreground ? measureResource(project, foreground, color, visited) : { width: 0, height: 0 };
        const backgroundDim = background ? measureResource(project, background, color, visited) : { width: 0, height: 0 };
        return {
          width: Math.max(foregroundDim.width, backgroundDim.width),
          height: Math.max(foregroundDim.height, backgroundDim.height),
        };
      }

      case "Slot": {
        const item = resource.children.find((child) => child.attrs.ref);
        const target = item ? findResource(project, refName(item.attrs.ref), color) : undefined;
        return target ? measureResource(project, target, color, visited) : { width: 0, height: 0 };
      }

      case "Widget": {
        const isFlexRow = resource.attrs.flex_direction === "row";
        const isFlexColumn = resource.attrs.flex_direction === "column";
        const gap = numberAttr(resource, "gap", 0);

        if (isFlexRow) {
          let totalW = 0;
          let maxH = 0;
          const childCount = resource.children.length;
          resource.children.forEach((child, index) => {
            const childRes = findResource(project, refName(child.attrs.ref), color);
            const dim = childRes ? getChildDimensions(project, childRes, color, visited) : { width: 0, height: 0 };
            totalW += dim.width;
            if (index < childCount - 1) totalW += gap;
            maxH = Math.max(maxH, dim.height);
          });
          return {
            width: Math.max(0, Math.round(totalW)),
            height: Math.max(0, Math.round(maxH)),
          };
        }

        if (isFlexColumn) {
          let maxW = 0;
          let totalH = 0;
          const childCount = resource.children.length;
          resource.children.forEach((child, index) => {
            const childRes = findResource(project, refName(child.attrs.ref), color);
            const dim = childRes ? getChildDimensions(project, childRes, color, visited) : { width: 0, height: 0 };
            maxW = Math.max(maxW, dim.width);
            totalH += dim.height;
            if (index < childCount - 1) totalH += gap;
          });
          return {
            width: Math.max(0, Math.round(maxW)),
            height: Math.max(0, Math.round(totalH)),
          };
        }

        // 绝对定位 Item
        let maxRight = 0;
        let maxBottom = 0;
        for (const child of resource.children) {
          const childRes = findResource(project, refName(child.attrs.ref), color);
          const dim = childRes ? getChildDimensions(project, childRes, color, visited) : { width: 0, height: 0 };
          const cx = Number(child.attrs.x) || 0;
          const cy = Number(child.attrs.y) || 0;
          maxRight = Math.max(maxRight, cx + dim.width);
          maxBottom = Math.max(maxBottom, cy + dim.height);
        }

        return {
          width: Math.max(0, Math.round(maxRight)),
          height: Math.max(0, Math.round(maxBottom)),
        };
      }

      default:
        return { width: 0, height: 0 };
    }
}

/**
 * 测量指定资源的真实像素包围盒 (width, height)
 * 支持递归测量 Widget、ImageArray、DataItem 等组合结构，带 WeakMap 二级记忆化缓存
 */
export function measureResource(
  project: ResourceMeasurementInput,
  resource: WatchfaceResource | undefined,
  color = "",
  visited = new Set<string>(),
): ResourceDimensions {
  if (!resource) return { width: 0, height: 0 };
  if (visited.has(resource.id)) return { width: 0, height: 0 };

  const assetsObj = project.assets as object | undefined;
  const isTopLevel = visited.size === 0;

  // 顶层测量优先检查缓存
  if (assetsObj && isTopLevel) {
    const assetsCache = measurementCache.get(resource);
    if (assetsCache) {
      const colorCache = assetsCache.get(assetsObj);
      if (colorCache) {
        const cached = colorCache.get(color);
        if (cached) return cached;
      }
    }
  }

  visited.add(resource.id);
  let result: ResourceDimensions;
  try {
    result = measureResourceRaw(project, resource, color, visited);
  } finally {
    visited.delete(resource.id);
  }

  // 顶层测量写入缓存
  if (assetsObj && isTopLevel) {
    let assetsCache = measurementCache.get(resource);
    if (!assetsCache) {
      assetsCache = new WeakMap();
      measurementCache.set(resource, assetsCache);
    }
    let colorCache = assetsCache.get(assetsObj);
    if (!colorCache) {
      colorCache = new Map();
      assetsCache.set(assetsObj, colorCache);
    }
    colorCache.set(color, result);
  }

  return result;
}

/**
 * 获取 Widget 的有效尺寸：若显式配置了 w/h 则使用配置值，否则自动计算测量尺寸
 */
export function getWidgetEffectiveSize(
  project: ResourceMeasurementInput,
  widget: WatchfaceResource,
  color = "",
): ResourceDimensions {
  const explicitW = Number(widget.attrs.w);
  const explicitH = Number(widget.attrs.h);

  const measured = measureResource(project, widget, color);

  return {
    width: Number.isFinite(explicitW) && explicitW > 0 ? explicitW : measured.width,
    height: Number.isFinite(explicitH) && explicitH > 0 ? explicitH : measured.height,
  };
}
