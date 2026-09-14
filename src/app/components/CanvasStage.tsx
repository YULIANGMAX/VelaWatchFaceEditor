import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Crosshair,
  Grid3X3,
  GripHorizontal,
  Maximize2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  SunMedium,
  Trash2,
} from "lucide-react";
import { dialogManager } from "../core/dialog";
import { refName, type ThemeLayout, type WatchfacePreviewContext, type WatchfaceProject } from "../core/model";
import { computeSmartGuides, type RectBox } from "../core/smartGuides";
import { getDeviceDefinition } from "../device-definition";
import { useEditorStore, type GridMode } from "../store/editorStore";
import { ResourceRenderer } from "./ResourceRenderer";
import { findResource } from "./renderers/common";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

export function clampToolbarPosition(
  pos: { x: number; y: number },
  frameSize: { width: number; height: number },
  toolbarSize: { width: number; height: number },
  padding = 8,
): { x: number; y: number } {
  const maxX = Math.max(padding, frameSize.width - toolbarSize.width - padding);
  const maxY = Math.max(padding, frameSize.height - toolbarSize.height - padding);
  return {
    x: Math.round(Math.max(padding, Math.min(maxX, pos.x))),
    y: Math.round(Math.max(padding, Math.min(maxY, pos.y))),
  };
}

interface DragState {
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RulerOrigin {
  left: number;
  top: number;
}

const GRID_STEP = 10;

export function layoutAnchorOffsetFactor(align: string | undefined): number {
  return align === "center" ? 0.5 : align === "right" ? 1 : 0;
}

export function layoutAnchorTransform(align: string | undefined): string | undefined {
  return align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : undefined;
}

export function dragCoordinate(
  rawValue: number,
  gridMode: GridMode,
  canvasDimension: number,
  elementDimension: number = 0,
  alignOffsetFactor: number = 0,
): number {
  if (gridMode === "none") return Math.round(rawValue);
  if (gridMode === "corner") {
    return Math.round(rawValue / GRID_STEP) * GRID_STEP;
  }
  // center 模式：以元素中心点对齐画布中心网格 (canvasCenter + k * GRID_STEP)
  const canvasCenter = canvasDimension / 2;
  // 元素的实际中心坐标（根据 align 对齐方式）：
  // alignOffsetFactor: 0 (左对齐) -> rawValue + w/2
  // alignOffsetFactor: 0.5 (居中) -> rawValue
  // alignOffsetFactor: 1 (右对齐) -> rawValue - w/2
  const elementCenter = rawValue + (0.5 - alignOffsetFactor) * elementDimension;
  const offsetFromCenter = elementCenter - canvasCenter;
  const snappedCenter = canvasCenter + Math.round(offsetFromCenter / GRID_STEP) * GRID_STEP;
  // 由吸附后的几何中心，反算出 layout 属性对应的坐标值
  const snappedValue = snappedCenter - (0.5 - alignOffsetFactor) * elementDimension;
  return Math.round(snappedValue);
}

export function isResourceTimeDependent(
  project: WatchfaceProject,
  ref: string,
  visited = new Set<string>(),
): boolean {
  const name = refName(ref);
  if (!name || visited.has(name)) return false;
  visited.add(name);

  const resource = project.resources.find((r) => r.attrs.name === name);
  if (!resource) return false;

  if (resource.type === "Sprite" || resource.type === "Pointer") return true;

  if (resource.type === "Progress" || resource.type === "ProgressArc" || resource.type === "ProgressCircle") {
    const src = (resource.attrs.source || "").toLowerCase();
    if (src.includes("time") || src.includes("second") || src.includes("minute") || src.includes("hour")) {
      return true;
    }
  }

  if (resource.type.startsWith("DataItem")) {
    const src = (resource.attrs.source || "").toLowerCase();
    if (
      src.includes("time") ||
      src.includes("second") ||
      src.includes("minute") ||
      src.includes("hour") ||
      src.includes("date") ||
      src.includes("day") ||
      src.includes("month") ||
      src.includes("year")
    ) {
      return true;
    }
  }

  if (resource.type === "Widget" || resource.type === "Slot") {
    for (const child of resource.children) {
      if (child.attrs.ref && isResourceTimeDependent(project, child.attrs.ref, visited)) {
        return true;
      }
    }
  }

  return false;
}

interface LayoutNodeProps {
  project: WatchfaceProject;
  layout: ThemeLayout;
  themeId: string;
  now: Date;
  preview: WatchfacePreviewContext;
  selected: boolean;
  overlayContainer?: HTMLDivElement | null;
  onDragGuidesChange?: (guides: { vertical: number[]; horizontal: number[] }) => void;
  onContextMenu?: (event: React.MouseEvent, layoutId: string) => void;
}

function areLayoutPropsEqual(prev: LayoutNodeProps, next: LayoutNodeProps): boolean {
  if (prev.selected !== next.selected) return false;
  if (prev.overlayContainer !== next.overlayContainer) return false;
  if (prev.themeId !== next.themeId) return false;
  if (prev.layout.id !== next.layout.id) return false;
  if (prev.onContextMenu !== next.onContextMenu) return false;

  // 比较 layout 属性 (x, y, ref 等)
  if (prev.layout !== next.layout) {
    const prevKeys = Object.keys(prev.layout.attrs);
    const nextKeys = Object.keys(next.layout.attrs);
    if (prevKeys.length !== nextKeys.length) return false;
    for (const k of prevKeys) {
      if (prev.layout.attrs[k] !== next.layout.attrs[k]) return false;
    }
  }

  // 比较影响外观的 preview 上下文要素
  if (prev.preview.color !== next.preview.color) return false;
  if (prev.preview.temperatureUnit !== next.preview.temperatureUnit) return false;
  if (prev.preview.metrics !== next.preview.metrics) return false;

  // 判断是否有时变依赖
  const isDynamic = isResourceTimeDependent(next.project, next.layout.attrs.ref);
  if (isDynamic) {
    if (prev.now.getTime() !== next.now.getTime()) return false;
    if (prev.preview.elapsedMs !== next.preview.elapsedMs) return false;
  }

  // 资源定义或全局配置是否变更
  if (prev.project !== next.project) {
    if (prev.project.resources !== next.project.resources) return false;
    if (prev.project.watchface !== next.project.watchface) return false;
    if (prev.project.assets !== next.project.assets) return false;
  }

  return true;
}

function rulerValues(limit: number, step: number): number[] {
  const values = Array.from({ length: Math.floor(limit / step) + 1 }, (_, index) => index * step);
  if (values.at(-1) !== limit) values.push(limit);
  return values;
}

const LayoutNode = memo(function LayoutNode({
  project,
  layout,
  themeId,
  now,
  preview,
  selected,
  overlayContainer,
  onDragGuidesChange,
  onContextMenu,
}: LayoutNodeProps) {
  const zoom = useEditorStore((state) => state.zoom);
  const gridMode = useEditorStore((state) => state.gridMode);
  const setSelection = useEditorStore((state) => state.setSelection);
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const updateLayout = useEditorStore((state) => state.updateLayout);
  const [drag, setDrag] = useState<DragState | null>(null);
  const resourceName = refName(layout.attrs.ref);
  const resource = project.resources.find((entry) => entry.attrs.name === resourceName);
  const x = drag?.x ?? Number(layout.attrs.x || 0);
  const y = drag?.y ?? Number(layout.attrs.y || 0);
  const align = resource?.attrs.align;
  const alignOffsetFactor = layoutAnchorOffsetFactor(align);

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (resource) {
      navigateTo({ kind: "resource", resourceId: resource.id });
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ kind: "layout", themeId, layoutId: layout.id });
    const rect = event.currentTarget.getBoundingClientRect();
    const domWidth = zoom > 0 ? rect.width / zoom : 0;
    const domHeight = zoom > 0 ? rect.height / zoom : 0;
    const width = Number(resource?.attrs.w) || domWidth || 0;
    const height = Number(resource?.attrs.h) || domHeight || 0;
    setDrag({
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: Number(layout.attrs.x || 0),
      originY: Number(layout.attrs.y || 0),
      x: Number(layout.attrs.x || 0),
      y: Number(layout.attrs.y || 0),
      width,
      height,
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rawX = drag.originX + (event.clientX - drag.startClientX) / zoom;
    const rawY = drag.originY + (event.clientY - drag.startClientY) / zoom;
    let finalX: number;
    let finalY: number;

    if (gridMode === "none") {
      const currentTheme = project.themes.find((t) => t.id === themeId);
      const others: RectBox[] = (currentTheme?.layouts || [])
        .filter((item) => item.id !== layout.id)
        .map((item) => {
          const rName = refName(item.attrs.ref);
          const res = project.resources.find((r) => r.attrs.name === rName);
          return {
            id: item.id,
            x: Number(item.attrs.x || 0),
            y: Number(item.attrs.y || 0),
            width: Number(res?.attrs.w || 0),
            height: Number(res?.attrs.h || 0),
          };
        });

      const guideRes = computeSmartGuides(
        { x: rawX, y: rawY, width: drag.width, height: drag.height },
        others,
        { width: project.canvas.width, height: project.canvas.height },
        5,
      );
      finalX = guideRes.snappedX;
      finalY = guideRes.snappedY;
      onDragGuidesChange?.({ vertical: guideRes.verticalGuides, horizontal: guideRes.horizontalGuides });
    } else {
      finalX = dragCoordinate(rawX, gridMode, project.canvas.width, drag.width, alignOffsetFactor);
      finalY = dragCoordinate(rawY, gridMode, project.canvas.height, drag.height, 0);
      onDragGuidesChange?.({ vertical: [], horizontal: [] });
    }

    setDrag({ ...drag, x: finalX, y: finalY });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onDragGuidesChange?.({ vertical: [], horizontal: [] });
    updateLayout(themeId, layout.id, { x: String(drag.x), y: String(drag.y) });
    setDrag(null);
  };

  return (
    <div
      className={`layout-node${selected ? " is-selected" : ""}`}
      style={{ left: x, top: y, transform: layoutAnchorTransform(align) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelection({ kind: "layout", themeId, layoutId: layout.id });
        onContextMenu?.(event, layout.id);
      }}
      title={`${layout.attrs.ref} · (${x}, ${y}) · 双击跳转到对应资源`}
    >
      <ResourceRenderer project={project} resourceName={resourceName} now={now} preview={preview} />
      {selected ? (
        overlayContainer ? (
          createPortal(
            <div
              className="layout-overlay-node"
              style={{
                left: x,
                top: y,
                transform: layoutAnchorTransform(align),
              }}
            >
              <span className={`layout-coordinate${y < 22 ? " is-flipped-y" : ""}`}>
                {x}, {y}
              </span>
            </div>,
            overlayContainer
          )
        ) : (
          <span className={`layout-coordinate${y < 22 ? " is-flipped-y" : ""}`}>
            {x}, {y}
          </span>
        )
      ) : null}
    </div>
  );
}, areLayoutPropsEqual);

export function computeCenterCoordinates(
  canvas: { width: number; height: number },
  element: { width: number; height: number; align?: string },
): { x: number; y: number } {
  const align = element.align;
  let x: number;
  if (align === "center") {
    x = Math.round(canvas.width / 2);
  } else if (align === "right") {
    x = Math.round(canvas.width / 2 + element.width / 2);
  } else {
    x = Math.round((canvas.width - element.width) / 2);
  }
  const y = Math.round((canvas.height - element.height) / 2);
  return { x, y };
}

export function CanvasStage(_props: {
  onOpenMetrics?: () => void;
  metricsOpen?: boolean;
} = {}) {
  const project = useEditorStore((state) => state.project);
  const selectedThemeId = useEditorStore((state) => state.selectedThemeId);
  const selectedLayoutId = useEditorStore((state) => state.selection.kind === "layout" ? state.selection.layoutId : null);
  const duplicateLayout = useEditorStore((state) => state.duplicateLayout);
  const removeLayout = useEditorStore((state) => state.removeLayout);
  const moveLayout = useEditorStore((state) => state.moveLayout);
  const reorderLayout = useEditorStore((state) => state.reorderLayout);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const gridMode = useEditorStore((state) => state.gridMode);
  const setGridMode = useEditorStore((state) => state.setGridMode);
  const previewColor = useEditorStore((state) => state.previewColor);
  const setPreviewColor = useEditorStore((state) => state.setPreviewColor);
  const previewTemperatureUnit = useEditorStore((state) => state.previewTemperatureUnit);
  const setPreviewTemperatureUnit = useEditorStore((state) => state.setPreviewTemperatureUnit);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const [now, setNow] = useState(new Date());
  const animationStartedAt = useRef(Date.now());
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [rulerOrigin, setRulerOrigin] = useState<RulerOrigin>({ left: 0, top: 0 });
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const theme = useMemo(
    () => project.themes.find((entry) => entry.id === selectedThemeId) || project.themes[0],
    [project.themes, selectedThemeId],
  );
  const setSelectedTheme = useEditorStore((state) => state.setSelectedTheme);
  const addTheme = useEditorStore((state) => state.addTheme);
  const duplicateTheme = useEditorStore((state) => state.duplicateTheme);
  const removeTheme = useEditorStore((state) => state.removeTheme);
  const setSelection = useEditorStore((state) => state.setSelection);
  const selection = useEditorStore((state) => state.selection);
  const updateLayout = useEditorStore((state) => state.updateLayout);

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const normalThemes = useMemo(() => project.themes.filter((t) => t.attrs.type !== "AOD"), [project.themes]);
  const aodThemes = useMemo(() => project.themes.filter((t) => t.attrs.type === "AOD"), [project.themes]);
  const isThemeInspected = Boolean(theme && selection.kind === "theme" && selection.themeId === theme.id);

  useEffect(() => {
    if (!themeMenuOpen && !addMenuOpen) return;
    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node;
      if (themeMenuOpen && themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setThemeMenuOpen(false);
      }
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
        setAddMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [themeMenuOpen, addMenuOpen]);

  const handleDeleteTheme = async (targetTheme: (typeof project.themes)[number]) => {
    if (project.themes.length <= 1) {
      void dialogManager.alert({
        title: "无法删除主题",
        message: "表盘工程至少需要保留一个主题。",
        type: "warning",
      });
      return;
    }
    const ok = await dialogManager.confirm({
      title: "删除主题",
      message: `确定要删除主题“${targetTheme.attrs.name || targetTheme.id}”吗？此操作无法撤销。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok) {
      removeTheme(targetTheme.id);
    }
  };
  const deviceCornerRadius = getDeviceDefinition(project.device).display.cornerRadius;
  const previewColors = useMemo(() => {
    const value = project.watchface.colorGroupTable || project.watchface.recolorTable || "";
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }, [project.watchface.colorGroupTable, project.watchface.recolorTable]);
  const activePreviewColor = previewColors.includes(previewColor) ? previewColor : previewColors[0] ?? "";
  const hasUnitMismatchResources = useMemo(() => {
    const sources = new Set(project.resources.map((resource) => resource.attrs.source));
    return sources.has("weatherCurrentTemperature") && sources.has("weatherCurrentTemperatureFahrenheit");
  }, [project.resources]);
  const hasActiveSprite = useMemo(() => {
    if (!theme) return false;
    const resourceMap = new Map(project.resources.map((entry) => [entry.attrs.name, entry]));
    const visited = new Set<string>();
    const queue: string[] = [];
    for (const layout of theme.layouts) {
      const name = refName(layout.attrs.ref);
      if (name) queue.push(name);
    }
    while (queue.length > 0) {
      const name = queue.pop()!;
      if (visited.has(name)) continue;
      visited.add(name);
      const res = resourceMap.get(name);
      if (!res) continue;
      if (res.type === "Sprite") return true;
      if (res.type === "Widget") {
        for (const child of res.children) {
          const childRef = refName(child.attrs.ref);
          if (childRef && !visited.has(childRef)) queue.push(childRef);
        }
      }
    }
    return false;
  }, [project.resources, theme]);
  const preview = useMemo<WatchfacePreviewContext>(() => ({
    color: activePreviewColor,
    elapsedMs: Math.max(0, now.getTime() - animationStartedAt.current),
    temperatureUnit: previewTemperatureUnit,
    metrics: previewMetrics,
  }), [activePreviewColor, now, previewMetrics, previewTemperatureUnit]);
  const rulerMajorStep = zoom < 0.65 ? 100 : zoom > 1.25 ? 25 : 50;
  const rulerMinorStep = rulerMajorStep / 5;
  const horizontalRuler = useMemo(
    () => rulerValues(project.canvas.width, rulerMinorStep),
    [project.canvas.width, rulerMinorStep],
  );
  const verticalRuler = useMemo(
    () => rulerValues(project.canvas.height, rulerMinorStep),
    [project.canvas.height, rulerMinorStep],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), hasActiveSprite ? 100 : 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveSprite]);

  useEffect(() => {
    animationStartedAt.current = Date.now();
  }, [project.watchface.id]);

  const syncRulerOrigin = useCallback(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;
    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    setRulerOrigin({
      left: stageRect.left - viewportRect.left,
      top: stageRect.top - viewportRect.top,
    });
  }, []);

  useLayoutEffect(() => {
    syncRulerOrigin();
  }, [project.canvas.height, project.canvas.width, syncRulerOrigin, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => syncRulerOrigin());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [syncRulerOrigin]);

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = viewport.clientWidth - 96;
    const availableHeight = viewport.clientHeight - 96;
    setZoom(Math.min(1.5, availableWidth / project.canvas.width, availableHeight / project.canvas.height));
  };

  const nextGridMode = () => {
    if (gridMode === "none") setGridMode("corner");
    else if (gridMode === "corner") setGridMode("center");
    else setGridMode("none");
  };

  const [activeGuides, setActiveGuides] = useState<{ vertical: number[]; horizontal: number[] }>({
    vertical: [],
    horizontal: [],
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    layoutId: string;
  } | null>(null);

  const handleLayoutContextMenu = useCallback((event: React.MouseEvent, layoutId: string) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      layoutId,
    });
  }, []);

  const contextMenuItems: ContextMenuEntry[] = useMemo(() => {
    if (!contextMenu || !theme) return [];
    const targetLayout = theme.layouts.find((l) => l.id === contextMenu.layoutId);
    if (!targetLayout) return [];
    const currentIndex = theme.layouts.findIndex((l) => l.id === contextMenu.layoutId);
    const total = theme.layouts.length;
    return [
      {
        id: "duplicate",
        label: "复制图层",
        icon: <Copy size={14} />,
        shortcut: "Ctrl+D",
        onClick: () => duplicateLayout(theme.id, targetLayout.id),
      },
      { type: "separator" },
      {
        id: "bring-to-front",
        label: "置于顶层",
        icon: <ChevronsUp size={14} />,
        disabled: currentIndex >= total - 1,
        onClick: () => reorderLayout(theme.id, targetLayout.id, total - 1),
      },
      {
        id: "move-up",
        label: "上移一层",
        icon: <ArrowUp size={14} />,
        disabled: currentIndex >= total - 1,
        onClick: () => moveLayout(theme.id, targetLayout.id, 1),
      },
      {
        id: "move-down",
        label: "下移一层",
        icon: <ArrowDown size={14} />,
        disabled: currentIndex <= 0,
        onClick: () => moveLayout(theme.id, targetLayout.id, -1),
      },
      {
        id: "send-to-back",
        label: "置于底层",
        icon: <ChevronsDown size={14} />,
        disabled: currentIndex <= 0,
        onClick: () => reorderLayout(theme.id, targetLayout.id, 0),
      },
      { type: "separator" },
      {
        id: "delete",
        label: "删除图层",
        icon: <Trash2 size={14} />,
        shortcut: "Delete",
        danger: true,
        onClick: () => removeLayout(theme.id, targetLayout.id),
      },
    ];
  }, [contextMenu, theme, project, duplicateLayout, updateLayout, reorderLayout, moveLayout, removeLayout]);

  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("mwe_floating_toolbar_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return { x: parsed.x, y: parsed.y };
        }
      }
    } catch {}
    return null;
  });

  const latestToolbarPos = useRef(toolbarPos);
  latestToolbarPos.current = toolbarPos;

  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const toolbarDragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const handleToolbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    const frame = viewportFrameRef.current;
    const toolbar = floatingToolbarRef.current;
    if (!frame || !toolbar) return;

    event.preventDefault();
    event.stopPropagation();

    const frameRect = frame.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    toolbarDragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: toolbarRect.left - frameRect.left,
      originY: toolbarRect.top - frameRect.top,
    };

    setIsDraggingToolbar(true);
    toolbar.setPointerCapture(event.pointerId);
  };

  const handleToolbarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolbarDragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const frame = viewportFrameRef.current;
    const toolbar = floatingToolbarRef.current;
    if (!frame || !toolbar) return;

    const frameRect = frame.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const nextPos = clampToolbarPosition(
      {
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      },
      frameRect,
      toolbarRect,
    );

    latestToolbarPos.current = nextPos;
    setToolbarPos(nextPos);
  };

  const handleToolbarPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolbarDragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    try {
      floatingToolbarRef.current?.releasePointerCapture(event.pointerId);
    } catch {}

    toolbarDragState.current = null;
    setIsDraggingToolbar(false);

    if (latestToolbarPos.current) {
      try {
        localStorage.setItem("mwe_floating_toolbar_pos", JSON.stringify(latestToolbarPos.current));
      } catch {}
    }
  };

  const handleToolbarResetPosition = (event: React.MouseEvent) => {
    event.stopPropagation();
    latestToolbarPos.current = null;
    setToolbarPos(null);
    try {
      localStorage.removeItem("mwe_floating_toolbar_pos");
    } catch {}
  };

  useEffect(() => {
    const frame = viewportFrameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      const currentPos = latestToolbarPos.current;
      const toolbar = floatingToolbarRef.current;
      if (!currentPos || !toolbar) return;
      const frameRect = frame.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const clamped = clampToolbarPosition(currentPos, frameRect, toolbarRect);
      if (clamped.x !== currentPos.x || clamped.y !== currentPos.y) {
        latestToolbarPos.current = clamped;
        setToolbarPos(clamped);
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  if (!theme) return <div className="canvas-empty">尚无主题</div>;

  return (
    <section className="canvas-panel">
      <div className="canvas-toolbar">
        <div className="canvas-theme-strip">
          <div className="theme-selector-wrapper" ref={themeMenuRef}>
            <button
              type="button"
              className={`theme-selector-trigger${themeMenuOpen ? " is-open" : ""}`}
              onClick={() => {
                setThemeMenuOpen(!themeMenuOpen);
                setAddMenuOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={themeMenuOpen}
              title="切换当前编辑主题"
            >
              <span className={`theme-type-badge ${theme.attrs.type === "AOD" ? "is-aod" : "is-normal"}`}>
                {theme.attrs.type === "AOD" ? <Moon size={11} /> : <SunMedium size={11} />}
                <span>{theme.attrs.type === "AOD" ? "息屏" : "普通"}</span>
              </span>
              <span className="theme-current-name">{theme.attrs.name || "未命名"}</span>
              <span className="theme-current-count">({theme.layouts.length})</span>
              <ChevronDown size={13} className={`theme-arrow-icon${themeMenuOpen ? " is-rotated" : ""}`} />
            </button>

            {themeMenuOpen && (
              <div className="theme-dropdown-panel" role="menu">
                <div className="theme-dropdown-scroll">
                  {normalThemes.length > 0 && (
                    <div className="theme-dropdown-group">
                      <div className="theme-group-header">
                        <SunMedium size={12} />
                        <span>普通主题 ({normalThemes.length})</span>
                      </div>
                      {normalThemes.map((t) => (
                        <div
                          key={t.id}
                          className={`theme-dropdown-item${t.id === theme.id ? " is-active" : ""}`}
                          onClick={() => {
                            setSelectedTheme(t.id);
                            setThemeMenuOpen(false);
                          }}
                          role="menuitem"
                        >
                          <div className="theme-item-left">
                            <span className="theme-item-check">
                              {t.id === theme.id ? <Check size={13} /> : null}
                            </span>
                            {t.attrs.bgColor && (
                              <span className="theme-color-swatch" style={{ backgroundColor: t.attrs.bgColor }} title={`背景色: ${t.attrs.bgColor}`} />
                            )}
                            <span className="theme-item-name">{t.attrs.name || "未命名"}</span>
                          </div>
                          <div className="theme-item-right">
                            <span className="theme-item-count">{t.layouts.length} 元素</span>
                            <div className="theme-item-actions">
                              <button
                                type="button"
                                className="theme-item-action-btn"
                                title="克隆此主题"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateTheme(t.id);
                                  setThemeMenuOpen(false);
                                }}
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                className="theme-item-action-btn is-danger"
                                title={project.themes.length > 1 ? "删除此主题" : "至少保留一个主题"}
                                disabled={project.themes.length <= 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteTheme(t);
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aodThemes.length > 0 && (
                    <div className="theme-dropdown-group">
                      <div className="theme-group-header">
                        <Moon size={12} />
                        <span>息屏 AOD 主题 ({aodThemes.length})</span>
                      </div>
                      {aodThemes.map((t) => (
                        <div
                          key={t.id}
                          className={`theme-dropdown-item${t.id === theme.id ? " is-active" : ""}`}
                          onClick={() => {
                            setSelectedTheme(t.id);
                            setThemeMenuOpen(false);
                          }}
                          role="menuitem"
                        >
                          <div className="theme-item-left">
                            <span className="theme-item-check">
                              {t.id === theme.id ? <Check size={13} /> : null}
                            </span>
                            {t.attrs.bgColor && (
                              <span className="theme-color-swatch" style={{ backgroundColor: t.attrs.bgColor }} title={`背景色: ${t.attrs.bgColor}`} />
                            )}
                            <span className="theme-item-name">{t.attrs.name || "未命名"}</span>
                          </div>
                          <div className="theme-item-right">
                            <span className="theme-item-count">{t.layouts.length} 元素</span>
                            <div className="theme-item-actions">
                              <button
                                type="button"
                                className="theme-item-action-btn"
                                title="克隆此主题"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateTheme(t.id);
                                  setThemeMenuOpen(false);
                                }}
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                className="theme-item-action-btn is-danger"
                                title={project.themes.length > 1 ? "删除此主题" : "至少保留一个主题"}
                                disabled={project.themes.length <= 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteTheme(t);
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`theme-property-btn${isThemeInspected ? " is-active" : ""}`}
            onClick={() => setSelection({ kind: "theme", themeId: theme.id })}
            title="在右侧属性面板配置当前主题（类型、名称、背景色等）"
            aria-label="配置主题属性"
          >
            <SlidersHorizontal size={13} />
            <span>属性</span>
          </button>

          <div className="theme-add-menu-wrapper" ref={addMenuRef}>
            <button
              type="button"
              className={`theme-add-trigger${addMenuOpen ? " is-open" : ""}`}
              onClick={() => {
                setAddMenuOpen(!addMenuOpen);
                setThemeMenuOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={addMenuOpen}
              title="新建或克隆主题"
            >
              <Plus size={13} />
              <span>新建</span>
              <ChevronDown size={11} className={`theme-arrow-icon${addMenuOpen ? " is-rotated" : ""}`} />
            </button>

            {addMenuOpen && (
              <div className="theme-add-dropdown" role="menu">
                <button
                  type="button"
                  className="theme-add-option"
                  onClick={() => {
                    addTheme("normal");
                    setAddMenuOpen(false);
                  }}
                >
                  <SunMedium size={13} className="theme-option-icon is-normal" />
                  <div className="theme-option-text">
                    <span className="theme-option-title">新建普通主题</span>
                    <span className="theme-option-desc">亮屏默认展示的表盘样式</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="theme-add-option"
                  onClick={() => {
                    addTheme("AOD");
                    setAddMenuOpen(false);
                  }}
                >
                  <Moon size={13} className="theme-option-icon is-aod" />
                  <div className="theme-option-text">
                    <span className="theme-option-title">新建息屏主题 (AOD)</span>
                    <span className="theme-option-desc">低功耗常亮待机表盘样式</span>
                  </div>
                </button>
                <div className="theme-dropdown-divider" />
                <button
                  type="button"
                  className="theme-add-option"
                  onClick={() => {
                    duplicateTheme(theme.id);
                    setAddMenuOpen(false);
                  }}
                >
                  <Copy size={13} className="theme-option-icon" />
                  <div className="theme-option-text">
                    <span className="theme-option-title">克隆当前主题</span>
                    <span className="theme-option-desc">复制“{theme.attrs.name || theme.id}”全部布局图层</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
        {previewColors.length > 0 || hasUnitMismatchResources ? (
          <div className="canvas-controls">
            {previewColors.length > 0 ? (
              <label className="preview-color-control" title="仅影响画布预览，不写入 manifest.xml">
                <span>配色</span>
                <select value={activePreviewColor} onChange={(event) => setPreviewColor(event.target.value)}>
                  {previewColors.map((color) => <option value={color} key={color}>{color}</option>)}
                </select>
              </label>
            ) : null}
            {hasUnitMismatchResources ? (
              <div className="preview-unit-toggle" role="group" aria-label="温度单位切换" title="用于预览 hideWhenUnitMismatch，不写入 manifest.xml">
                <span className="preview-unit-label">温度</span>
                <div className="unit-switch-capsule">
                  <button
                    type="button"
                    className={`unit-switch-btn${previewTemperatureUnit === "celsius" ? " is-active" : ""}`}
                    onClick={() => setPreviewTemperatureUnit("celsius")}
                    title="切换为摄氏度 (℃)"
                  >
                    ℃
                  </button>
                  <button
                    type="button"
                    className={`unit-switch-btn${previewTemperatureUnit === "fahrenheit" ? " is-active" : ""}`}
                    onClick={() => setPreviewTemperatureUnit("fahrenheit")}
                    title="切换为华氏度 (℉)"
                  >
                    ℉
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="canvas-viewport-frame" ref={viewportFrameRef}>
        <div className="canvas-viewport" ref={viewportRef} onScroll={syncRulerOrigin}>
          <div
            ref={stageRef}
            className="stage-shell"
            style={{
              width: project.canvas.width * zoom,
              height: project.canvas.height * zoom,
              borderRadius: deviceCornerRadius * zoom,
            }}
          >
            <div className="watchface-clip" style={{ borderRadius: deviceCornerRadius * zoom }}>
              <div
                className={`watchface-stage${gridMode !== "none" ? ` grid-${gridMode} has-grid` : ""}${theme.attrs.type === "AOD" ? " is-aod" : ""}`}
                style={{
                  width: project.canvas.width,
                  height: project.canvas.height,
                  borderRadius: deviceCornerRadius,
                  backgroundColor: theme.attrs.bgColor || "#000000",
                  transform: `scale(${zoom})`,
                }}
              >
                {gridMode === "center" ? (
                  <div className="stage-center-crosshair">
                    <div className="stage-center-point" />
                  </div>
                ) : null}
                {theme.layouts.map((layout) => (
                  <LayoutNode
                    key={layout.id}
                    project={project}
                    layout={layout}
                    themeId={theme.id}
                    now={now}
                    preview={preview}
                    selected={selectedLayoutId === layout.id}
                    overlayContainer={overlayContainer}
                    onDragGuidesChange={setActiveGuides}
                    onContextMenu={handleLayoutContextMenu}
                  />
                ))}
                {/* 智能吸附对齐参考线 */}
                {activeGuides.vertical.map((gx, idx) => (
                  <div key={`guide-v-${idx}-${gx}`} className="smart-guide-line smart-guide-line-x" style={{ left: gx }} />
                ))}
                {activeGuides.horizontal.map((gy, idx) => (
                  <div key={`guide-h-${idx}-${gy}`} className="smart-guide-line smart-guide-line-y" style={{ top: gy }} />
                ))}
                {theme.layouts.length === 0 ? (
                  <div className="canvas-empty-dial-hint">
                    <div className="empty-dial-crosshair" />
                    <span>表盘暂无可见图层</span>
                    <small style={{ fontSize: "11px", opacity: 0.8 }}>在左侧添加图层或引用资源</small>
                  </div>
                ) : null}
              </div>
            </div>
            {/* 顶层交互悬浮层：脱离 watchface-clip 的 overflow: hidden 圆角裁剪 */}
            <div
              className="stage-interactive-overlay"
              ref={setOverlayContainer}
              style={{
                width: project.canvas.width,
                height: project.canvas.height,
                transform: `scale(${zoom})`,
              }}
            />
          </div>
        </div>
        <div className="canvas-ruler canvas-ruler-horizontal" aria-hidden="true">
          <div
            className="canvas-ruler-track"
            style={{ left: rulerOrigin.left, width: project.canvas.width * zoom + 1 }}
          >
            {horizontalRuler.map((value) => {
              const endpoint = value === project.canvas.width;
              const major = value % rulerMajorStep === 0 || endpoint;
              return (
                <span className={`${major ? "is-major" : ""}${endpoint ? " is-endpoint" : ""}`.trim() || undefined} style={{ left: value * zoom }} key={value}>
                  {major ? <em>{value}</em> : null}
                </span>
              );
            })}
          </div>
        </div>
        <div className="canvas-ruler canvas-ruler-vertical" aria-hidden="true">
          <div
            className="canvas-ruler-track"
            style={{ top: rulerOrigin.top, height: project.canvas.height * zoom + 1 }}
          >
            {verticalRuler.map((value) => {
              const endpoint = value === project.canvas.height;
              const major = value % rulerMajorStep === 0 || endpoint;
              return (
                <span className={`${major ? "is-major" : ""}${endpoint ? " is-endpoint" : ""}`.trim() || undefined} style={{ top: value * zoom }} key={value}>
                  {major ? <em>{value}</em> : null}
                </span>
              );
            })}
          </div>
        </div>
        <div className="canvas-ruler-corner">px</div>
        <div
          ref={floatingToolbarRef}
          className={`canvas-floating-toolbar${isDraggingToolbar ? " is-dragging" : ""}`}
          style={
            toolbarPos
              ? { left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px`, right: "auto", bottom: "auto" }
              : undefined
          }
          role="toolbar"
          aria-label="画布辅助工具"
          onPointerDown={handleToolbarPointerDown}
          onPointerMove={handleToolbarPointerMove}
          onPointerUp={handleToolbarPointerUp}
          onPointerCancel={handleToolbarPointerUp}
        >
          <div
            className="canvas-floating-toolbar-handle"
            title="按住拖动调整位置 · 双击恢复默认位置"
            onDoubleClick={handleToolbarResetPosition}
          >
            <GripHorizontal size={14} />
          </div>
          <button
            className={`icon-button${gridMode !== "none" ? " is-active" : ""}`}
            onClick={nextGridMode}
            title={
              gridMode === "none"
                ? "网格：已关闭 (点击开启左上原点网格)"
                : gridMode === "corner"
                ? "网格：左上原点 (0, 0) · 10px 吸附 (点击切换中心原点网格)"
                : "网格：中心原点 (Center) · 10px 吸附 (点击关闭网格)"
            }
          >
            {gridMode === "center" ? <Crosshair size={15} /> : <Grid3X3 size={15} />}
          </button>
          <div className="floating-divider" />
          <button className="icon-button" onClick={() => setZoom(zoom + 0.1)} title="放大"><Plus size={15} /></button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => setZoom(zoom - 0.1)} title="缩小"><Minus size={15} /></button>
          <div className="floating-divider" />
          <button className="icon-button" onClick={() => setZoom(1)} title="重置为 100%" aria-label="重置缩放为 100%"><RotateCcw size={15} /></button>
          <button className="icon-button" onClick={fit} title="适合窗口"><Maximize2 size={15} /></button>

        </div>
      </div>
      <div className="canvas-footer">
        <span>模拟时间 {now.toLocaleTimeString("zh-CN", { hour12: false })}</span>
        <span>{selectedLayoutId ? "拖动元素调整坐标" : "选择元素开始编辑"}</span>
      </div>
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </section>
  );
}
