export interface RectBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartGuidesResult {
  snappedX: number;
  snappedY: number;
  verticalGuides: number[];   // 垂直参考线在画布上的 x 坐标
  horizontalGuides: number[]; // 水平参考线在画布上的 y 坐标
}

/**
 * 计算拖拽元素与画布几何中心及兄弟图层之间的磁吸对齐
 * @param dragging 当前拖拽中的包围盒（使用未吸附的 rawX, rawY）
 * @param others 同级其他兄弟图层的包围盒列表
 * @param canvasSize 画布宽高
 * @param threshold 吸附阈值（默认 4 像素）
 */
export function computeSmartGuides(
  dragging: { x: number; y: number; width: number; height: number },
  others: RectBox[],
  canvasSize: { width: number; height: number },
  threshold = 4,
): SmartGuidesResult {
  let snappedX = Math.round(dragging.x);
  let snappedY = Math.round(dragging.y);
  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];

  const dragWidth = Math.max(0, dragging.width);
  const dragHeight = Math.max(0, dragging.height);

  // --- X 轴吸附判定 ---
  // 拖拽元素的三个特征 X 点：左、中、右
  const dragLeft = dragging.x;
  const dragCenterX = dragging.x + dragWidth / 2;
  const dragRight = dragging.x + dragWidth;

  // 候选对齐线集合
  const xTargets: number[] = [canvasSize.width / 2]; // 画布垂直中线
  for (const other of others) {
    xTargets.push(other.x);
    xTargets.push(other.x + other.width / 2);
    xTargets.push(other.x + other.width);
  }

  let minDeltaX = threshold + 1;
  let bestXSnap: number | null = null;
  let bestXGuide: number | null = null;

  for (const target of xTargets) {
    // 1. 左边缘吸附 target
    const deltaLeft = Math.abs(dragLeft - target);
    if (deltaLeft <= threshold && deltaLeft < minDeltaX) {
      minDeltaX = deltaLeft;
      bestXSnap = target;
      bestXGuide = target;
    }
    // 2. 中心点吸附 target
    const deltaCenter = Math.abs(dragCenterX - target);
    if (deltaCenter <= threshold && deltaCenter < minDeltaX) {
      minDeltaX = deltaCenter;
      bestXSnap = target - dragWidth / 2;
      bestXGuide = target;
    }
    // 3. 右边缘吸附 target
    const deltaRight = Math.abs(dragRight - target);
    if (deltaRight <= threshold && deltaRight < minDeltaX) {
      minDeltaX = deltaRight;
      bestXSnap = target - dragWidth;
      bestXGuide = target;
    }
  }

  if (bestXSnap !== null && bestXGuide !== null) {
    snappedX = Math.round(bestXSnap);
    verticalGuides.push(Math.round(bestXGuide));
  }

  // --- Y 轴吸附判定 ---
  // 拖拽元素的三个特征 Y 点：顶、中、底
  const dragTop = dragging.y;
  const dragCenterY = dragging.y + dragHeight / 2;
  const dragBottom = dragging.y + dragHeight;

  // 候选对齐线集合
  const yTargets: number[] = [canvasSize.height / 2]; // 画布水平中线
  for (const other of others) {
    yTargets.push(other.y);
    yTargets.push(other.y + other.height / 2);
    yTargets.push(other.y + other.height);
  }

  let minDeltaY = threshold + 1;
  let bestYSnap: number | null = null;
  let bestYGuide: number | null = null;

  for (const target of yTargets) {
    // 1. 顶边缘吸附 target
    const deltaTop = Math.abs(dragTop - target);
    if (deltaTop <= threshold && deltaTop < minDeltaY) {
      minDeltaY = deltaTop;
      bestYSnap = target;
      bestYGuide = target;
    }
    // 2. 中心点吸附 target
    const deltaCenter = Math.abs(dragCenterY - target);
    if (deltaCenter <= threshold && deltaCenter < minDeltaY) {
      minDeltaY = deltaCenter;
      bestYSnap = target - dragHeight / 2;
      bestYGuide = target;
    }
    // 3. 底边缘吸附 target
    const deltaBottom = Math.abs(dragBottom - target);
    if (deltaBottom <= threshold && deltaBottom < minDeltaY) {
      minDeltaY = deltaBottom;
      bestYSnap = target - dragHeight;
      bestYGuide = target;
    }
  }

  if (bestYSnap !== null && bestYGuide !== null) {
    snappedY = Math.round(bestYSnap);
    horizontalGuides.push(Math.round(bestYGuide));
  }

  return {
    snappedX,
    snappedY,
    verticalGuides: Array.from(new Set(verticalGuides)),
    horizontalGuides: Array.from(new Set(horizontalGuides)),
  };
}
