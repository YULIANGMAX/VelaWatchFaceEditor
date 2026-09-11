import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Box, ChevronDown, FileText, GripVertical, Layers, Palette, Pencil, Plus, Settings, Sliders, Sparkles, X } from "lucide-react";
import {
  DEVICE_PROFILES,
  getDeviceDefinition,
  getDeviceProfile,
  getResourceName,
  getThemePreviewUrl,
  refName,
  watchfaceDisplayName,
  type Attributes,
  type DeviceType,
  type ResourceItem,
  type ResourceType,
  type WatchfacePreviewContext,
  type WatchfaceProject,
  type WatchfaceResource,
  type WatchfaceTheme,
} from "../core/model";
import {
  DESCRIPTION_FIELDS,
  LAYOUT_FIELDS,
  RESOURCE_DEFINITION_MAP,
  THEME_FIELDS,
  WATCHFACE_FIELDS,
  isFieldRequired,
  isFieldVisible,
  type FieldDefinition,
  type ResourceDefinition,
} from "../editor/manifestEditorSchema";
import { isDataSourceSupported } from "../device-definition";
import { DATA_SOURCE_LABELS } from "../device-definition/dataSourceLabels";
import { measureResource } from "../core/measure";
import { isDeviceAttributeEditable, isDeviceResourceEditable } from "../editor/deviceEditorCapabilities";
import { useEditorStore } from "../store/editorStore";
import { AssetPathSelect, ComboboxInput, FieldInput, ResourceReferenceSelect } from "./FieldInput";
import { ResourceRenderer } from "./ResourceRenderer";
import { layoutAnchorTransform } from "./CanvasStage";
import { setDragGhost } from "../core/dragGhost";
import { dialogManager } from "../core/dialog";
import { AppIcon } from "./AppIcon";
import { findResourceReferences, type ResourceReference } from "../editor/resourceReferences";

function MiniThemePreview({ project, theme }: { project: WatchfaceProject; theme: WatchfaceTheme }) {
  const width = project.canvas.width;
  const height = project.canvas.height;
  const scale = Math.min(44 / Math.max(1, width), 44 / Math.max(1, height));
  const device = getDeviceDefinition(project.device);
  const cornerRadius = device.display.cornerRadius;
  const now = useMemo(() => new Date(), []);
  const preview = useMemo<WatchfacePreviewContext>(
    () => ({ color: "", elapsedMs: 0, temperatureUnit: "celsius", metrics: {} }),
    [],
  );

  return (
    <div
      className="mini-theme-preview-shell"
      style={{
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        borderRadius: Math.max(2, Math.round(cornerRadius * scale)),
        overflow: "hidden",
        position: "relative",
        backgroundColor: theme.attrs.bgColor || "#000000",
      }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
        }}
      >
        {theme.layouts.map((layout) => {
          const resourceName = refName(layout.attrs.ref);
          const resource = project.resources.find((r) => getResourceName(r) === resourceName);
          const align = resource?.attrs.align;
          return (
            <div
              key={layout.id}
              style={{
                position: "absolute",
                left: Number(layout.attrs.x || 0),
                top: Number(layout.attrs.y || 0),
                transform: layoutAnchorTransform(align),
              }}
            >
              <ResourceRenderer project={project} resourceName={resourceName} now={now} preview={preview} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FittedResourcePreview({
  children,
  estimatedWidth = 0,
  estimatedHeight = 0,
  onMeasure,
}: {
  children: ReactNode;
  estimatedWidth?: number;
  estimatedHeight?: number;
  onMeasure?: (width: number, height: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => {
    if (estimatedWidth > 0 && estimatedHeight > 0) {
      return Math.min(1, 98 / estimatedWidth, 68 / estimatedHeight);
    }
    return 1;
  });
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;
    const updateScale = () => {
      const width = renderer.scrollWidth;
      const height = renderer.scrollHeight;
      if (!width || !height) return;
      onMeasureRef.current?.(width, height);
      const nextScale = Math.min(1, container.clientWidth / width, container.clientHeight / height);
      setScale((current) => Math.abs(current - nextScale) < 0.001 ? current : nextScale);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    observer.observe(renderer);
    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <div ref={containerRef} className="resource-preview-content">
      <div ref={rendererRef} className="resource-preview-renderer" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

interface InspectorHeaderProps {
  preview: ReactNode;
  name: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  namePlaceholder?: string;
  editTitle?: string;
  dimensions?: string | null;
  className?: string;
}

export function InspectorHeader({
  preview,
  name,
  disabled = false,
  onChange,
  namePlaceholder = "未命名",
  editTitle = "编辑名称",
  dimensions,
  className = "",
}: InspectorHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    setEditing(false);
    onChange?.(draft);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
  };

  return (
    <header className={`inspector-header inspector-main-header inspector-resource-header${className ? ` ${className}` : ""}`}>
      {preview}
      <div className="resource-name-column">
        <div className="resource-name-line">
          {editing ? (
            <input
              ref={inputRef}
              className="resource-name-input"
              value={draft}
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") cancel();
              }}
            />
          ) : (
            <h2 title={name || namePlaceholder}>{name || namePlaceholder}</h2>
          )}
          {disabled || editing || !onChange ? null : (
            <button className="resource-name-edit-button" type="button" onClick={() => setEditing(true)} title={editTitle}>
              <Pencil size={13} />
            </button>
          )}
        </div>
        {dimensions ? (
          <div className="resource-badges-row">
            <span className="resource-dimension-badge" title={`尺寸：${dimensions} 像素`}>
              {dimensions} px
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

interface InspectorCardProps {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  headerExtra?: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

function InspectorCard({
  title,
  icon,
  badge,
  headerExtra,
  className = "",
  defaultCollapsed = false,
  children,
}: InspectorCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={`inspector-card${collapsed ? " is-collapsed" : ""}${className ? ` ${className}` : ""}`}>
      <div
        className="inspector-card-header is-clickable"
        onClick={() => setCollapsed((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
      >
        <div className="card-header-title-group">
          <span className="card-icon">{icon}</span>
          <span className="card-title-text">{title}</span>
          {badge}
        </div>
        <div className="card-header-actions">
          {headerExtra}
          <div className="card-collapse-arrow-wrap">
            <ChevronDown size={14} className={`card-collapse-arrow${collapsed ? " is-collapsed" : ""}`} />
          </div>
        </div>
      </div>
      {!collapsed && (
        <div className={`inspector-card-body${className.includes("child-editor") ? " child-list-body" : ""}`}>
          {children}
        </div>
      )}
    </section>
  );
}

function ResourcePreview({
  resource,
  onDimensionsChange,
}: {
  resource: WatchfaceResource;
  onDimensionsChange?: (dimensions: string | null) => void;
}) {
  const project = useEditorStore((state) => state.project);
  const previewColor = useEditorStore((state) => state.previewColor);
  const previewTemperatureUnit = useEditorStore((state) => state.previewTemperatureUnit);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const activePreviewColor = previewColor || (project.watchface.recolorTable?.split(",")[0]?.trim() ?? "");
  const imageArray = resource.type === "Sprite"
    ? project.resources.find((entry) => entry.type === "ImageArray" && getResourceName(entry) === refName(resource.attrs.ref))
    : resource.type === "ImageArray" ? resource : undefined;
  const frameCount = imageArray?.children.length ?? 0;
  const interval = resource.type === "Sprite" ? Math.max(80, Number(resource.attrs.interval) || 80) : 500;
  const [frameIndex, setFrameIndex] = useState(0);
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);

  const handleMeasure = useCallback((w: number, h: number) => {
    setMeasuredSize((prev) => (prev?.width === w && prev?.height === h ? prev : { width: w, height: h }));
  }, []);

  const imagePath = resource.type === "Image" ? resource.attrs.src : imageArray?.children[0]?.attrs.src;
  const imageAsset = imagePath ? project.assets[imagePath.replaceAll("\\", "/")] : undefined;

  // 1. 显式声明的宽高（如 Widget、ArcProgressBar 等）
  const explicitWidth = Number(resource.attrs.w);
  const explicitHeight = Number(resource.attrs.h);

  // 2. 图片/序列帧资产尺寸
  const assetWidth = imageAsset?.width;
  const assetHeight = imageAsset?.height;

  // 3. 如果是引用了 ImageArray 的数据型资源（如 DataItemImageValues）
  const refImageArray = resource.attrs.ref
    ? project.resources.find((entry) => entry.type === "ImageArray" && `@${entry.attrs.name}` === resource.attrs.ref)
    : undefined;
  const refFirstSrc = refImageArray?.children[0]?.attrs.src;
  const refImageAsset = refFirstSrc ? project.assets[refFirstSrc.replaceAll("\\", "/")] : undefined;

  // 4. 如果是 Widget 包含绝对定位子项且未显式写 w/h
  let widgetContentWidth = 0;
  let widgetContentHeight = 0;
  if (resource.type === "Widget" && resource.children.length > 0 && !resource.attrs.flex_direction) {
    for (const child of resource.children) {
      const cx = Number(child.attrs.x || 0);
      const cy = Number(child.attrs.y || 0);
      const childRes = project.resources.find((r) => `@${r.attrs.name}` === child.attrs.ref);
      const cw = Number(childRes?.attrs.w) || 0;
      const ch = Number(childRes?.attrs.h) || 0;
      widgetContentWidth = Math.max(widgetContentWidth, cx + cw);
      widgetContentHeight = Math.max(widgetContentHeight, cy + ch);
    }
  }

  // 确定预估与实际尺寸
  const fallbackDimensions = measureResource(project, resource, activePreviewColor);
  const targetWidth = explicitWidth > 0
    ? explicitWidth
    : (assetWidth || fallbackDimensions.width || widgetContentWidth || refImageAsset?.width || 0);
  const targetHeight = explicitHeight > 0
    ? explicitHeight
    : (assetHeight || fallbackDimensions.height || widgetContentHeight || refImageAsset?.height || 0);

  let dimensions: string | null = null;
  if (targetWidth > 0 && targetHeight > 0) {
    dimensions = `${Math.round(targetWidth)} × ${Math.round(targetHeight)}`;
  } else if (measuredSize && measuredSize.width > 0 && measuredSize.height > 0) {
    dimensions = `${Math.round(measuredSize.width)} × ${Math.round(measuredSize.height)}`;
  }

  useEffect(() => {
    onDimensionsChange?.(dimensions);
  }, [dimensions, onDimensionsChange]);

  useEffect(() => {
    setMeasuredSize(null);
  }, [resource.id]);

  useEffect(() => {
    setFrameIndex(0);
    if (frameCount < 2) return;
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % frameCount), interval);
    return () => window.clearInterval(timer);
  }, [frameCount, imageArray?.id, interval, resource.id]);

  return (
    <div className="resource-preview" title={dimensions ? `资源预览 · ${dimensions} px` : "资源预览"}>
      <FittedResourcePreview
        key={resource.id}
        estimatedWidth={targetWidth}
        estimatedHeight={targetHeight}
        onMeasure={handleMeasure}
      >
        <ResourceRenderer
          project={project}
          resourceName={resource.attrs.name || resource.id}
          now={new Date()}
          preview={{ color: activePreviewColor, elapsedMs: 0, temperatureUnit: previewTemperatureUnit, metrics: previewMetrics }}
          frameIndex={frameIndex}
        />
      </FittedResourcePreview>
    </div>
  );
}

function ResourceInspectorHeader({
  resource,
  editable,
  onNameChange,
  namePrefix,
  fallbackRef,
}: {
  resource?: WatchfaceResource;
  definition?: ResourceDefinition;
  editable: boolean;
  onNameChange?: (value: string) => void;
  namePrefix?: string;
  fallbackRef?: string;
}) {
  const [dimensions, setDimensions] = useState<string | null>(null);

  const rawName = resource?.attrs.name || fallbackRef || "";
  const displayName = namePrefix && rawName && !rawName.startsWith(namePrefix) ? `${namePrefix}${rawName}` : rawName;

  const handleNameChange = (val: string) => {
    const clean = namePrefix && val.startsWith(namePrefix) ? val.slice(namePrefix.length) : val;
    onNameChange?.(clean);
  };

  const preview = resource ? (
    <ResourcePreview resource={resource} onDimensionsChange={setDimensions} />
  ) : (
    <div className="resource-preview" title="未关联到资源">
      <div className="resource-placeholder">无资源</div>
    </div>
  );

  return (
    <InspectorHeader
      key={resource?.id || fallbackRef}
      preview={preview}
      name={displayName}
      disabled={!editable || !onNameChange}
      dimensions={dimensions}
      onChange={handleNameChange}
    />
  );
}

function Fields({
  fields,
  attrs,
  onChange,
  target,
  resourceType,
  resource,
}: {
  fields: FieldDefinition[];
  attrs: Attributes;
  onChange: (key: string, value: string) => void;
  target?: string;
  resourceType?: WatchfaceResource["type"];
  resource?: WatchfaceResource;
}) {
  const project = useEditorStore((state) => state.project);
  const visibleFields = fields.filter((field) => !field.hidden && (isFieldVisible(field, attrs) || Boolean(attrs[field.key])));
  const isWidget = target === "Widget" || resourceType === "Widget";
  const isColumn = isWidget && attrs.flex_direction === "column";
  const measuredSize = isWidget && resource ? measureResource(project, resource) : undefined;

  return (
    <div className="fields property-table">
      {visibleFields.map((field) => {
        let displayField = field;
        if (isWidget) {
          if (field.key === "justify_content") {
            displayField = { ...field, label: isColumn ? "主轴对齐（纵轴）" : "主轴对齐（横轴）" };
          } else if (field.key === "align_items") {
            displayField = { ...field, label: isColumn ? "交叉轴对齐（横轴）" : "交叉轴对齐（纵轴）" };
          } else if (field.key === "align_content") {
            displayField = { ...field, label: isColumn ? "多行对齐（横轴）" : "多行对齐（纵轴）" };
          }
        }
        const computableValue = isWidget && measuredSize && (measuredSize.width > 0 || measuredSize.height > 0)
          ? field.key === "w" ? measuredSize.width : field.key === "h" ? measuredSize.height : undefined
          : undefined;

        return (
          <Fragment key={field.key}>
            <FieldInput
              field={{ ...displayField, required: isFieldRequired(displayField, attrs) }}
              value={attrs[field.key] ?? ""}
              project={project}
              target={target}
              computableValue={computableValue}
              disabled={Boolean((resourceType && !isDeviceResourceEditable(project.device, resourceType)) || (target && !isDeviceAttributeEditable(project.device, target, field.key)))}
              onChange={(value) => onChange(field.key, value)}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function ChildEditor({
  resource,
  childDefinition,
}: {
  resource: WatchfaceResource;
  childDefinition: ChildDefinition;
}) {
  const project = useEditorStore((state) => state.project);
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const addChild = useEditorStore((state) => state.addChild);
  const updateChild = useEditorStore((state) => state.updateChild);
  const removeChild = useEditorStore((state) => state.removeChild);
  const reorderChild = useEditorStore((state) => state.reorderChild);
  const [draggedChildId, setDraggedChildId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const childTag = childDefinition.tag;

  const blankChild = (): Attributes => {
    if (childTag === "Image") return { src: "" };
    if (childTag === "Param") return { value: String(resource.children.length * 10) };
    if (childTag === "Content") return { source: "timeHour" };
    if (resource.type === "Translation") {
      const used = new Set(resource.children.map((child) => child.attrs.language));
      const language = childDefinition.fields.find((field) => field.key === "language")?.options?.find((entry) => !used.has(entry)) ?? "zh_CN";
      return { language, str: "文本" };
    }
    return { ref: "" };
  };

  const addChildren = (count: number) => {
    if (!isDeviceResourceEditable(project.device, resource.type)) return;
    for (let i = 0; i < count; i += 1) addChild(resource.id, blankChild());
  };

  const refValue = resource.type === "DataItemImageValues" ? resource.attrs.ref : "";
  const imageArray = refValue
    ? project.resources.find((entry) => entry.type === "ImageArray" && `@${entry.attrs.name}` === refValue)
    : undefined;
  const frameThumb = (frameIndex: number): string | undefined => {
    if (!imageArray) return undefined;
    if (frameIndex < 0 || frameIndex >= imageArray.children.length) return undefined;
    const src = imageArray.children[frameIndex]?.attrs.src;
    return src ? project.assets[src]?.url : undefined;
  };

  const isFlexLayout = resource.type === "Widget" && Boolean(resource.attrs.flex_direction);

  const onUpdateChild = useCallback((childId: string, key: string, value: string) => {
    updateChild(resource.id, childId, key, value);
  }, [resource.id, updateChild]);

  const onRemoveChild = useCallback((childId: string) => {
    removeChild(resource.id, childId);
  }, [resource.id, removeChild]);

  const onNavigateToResource = useCallback((targetResId: string) => {
    navigateTo({ kind: "resource", resourceId: targetResId });
  }, [navigateTo]);

  const handleDragStart = useCallback((event: React.DragEvent, childId: string, index: number, label: string) => {
    setDraggedChildId(childId);
    event.dataTransfer.effectAllowed = "move";
    setDragGhost(event, `${String(index).padStart(2, "0")} · ${childTag}`, label);
  }, [childTag]);

  const handleDragEnd = useCallback(() => {
    setDraggedChildId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, childId: string) => {
    if (draggedChildId && draggedChildId !== childId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setDropTarget((current) => (current?.id === childId && current.position === position ? current : { id: childId, position }));
    }
  }, [draggedChildId]);

  const handleDragLeave = useCallback((event: React.DragEvent, childId: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropTarget((current) => (current?.id === childId ? null : current));
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent, childId: string, index: number) => {
    event.preventDefault();
    if (draggedChildId && draggedChildId !== childId && dropTarget) {
      const sourceIndex = resource.children.findIndex((c) => c.id === draggedChildId);
      const targetIndex = index;
      let finalIndex = targetIndex;
      if (dropTarget.position === "before") {
        finalIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      } else {
        finalIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
      }
      reorderChild(resource.id, draggedChildId, Math.max(0, Math.min(resource.children.length - 1, finalIndex)));
    }
    setDraggedChildId(null);
    setDropTarget(null);
  }, [draggedChildId, dropTarget, reorderChild, resource.children, resource.id]);

  const sectionTitle = (() => {
    if (resource.type === "ImageArray") return "图片帧序列";
    if (resource.type === "Translation") return "多语言条目";
    if (resource.type === "Widget") return "子组件列表";
    if (childTag === "Item") return "子项列表";
    return `${childTag} 列表`;
  })();

  return (
    <InspectorCard
      title={sectionTitle}
      icon={<Layers size={14} className="card-icon" />}
      className="child-editor"
      badge={<span className="child-count-pill">{resource.children.length}</span>}
      headerExtra={
        <div className="child-quick-add-group" onClick={(e) => e.stopPropagation()}>
          <div className="child-segmented-add">
            <button
              type="button"
              className="child-seg-btn"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(1)}
              title="添加 1 个子项"
            >
              +1
            </button>
            <button
              type="button"
              className="child-seg-btn child-seg-bulk"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(10)}
              title="批量添加 10 个子项"
            >
              +10
            </button>
          </div>
        </div>
      }
    >
      {resource.children.length === 0 ? (
        <div className="child-empty-state">
          <Layers size={22} className="child-empty-icon" />
          <span className="child-empty-text">暂无{sectionTitle}</span>
          <div className="child-empty-actions">
            <button
              type="button"
              className="child-add-first-btn"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(1)}
            >
              <Plus size={13} />
              <span>添加首个子项</span>
            </button>
            <button
              type="button"
              className="child-empty-bulk-btn"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(10)}
            >
              批量添加 10 项
            </button>
          </div>
        </div>
      ) : (
        <>
          {resource.children.map((child, index) => (
            <ChildItemCard
              key={child.id}
              project={project}
              resourceId={resource.id}
              resourceType={resource.type}
              child={child}
              index={index}
              childTag={childTag}
              childDefinition={childDefinition}
              isFlexLayout={isFlexLayout}
              isDragging={draggedChildId === child.id}
              dropPosition={dropTarget?.id === child.id ? dropTarget.position : null}
              frameThumbSrc={frameThumb(index)}
              onUpdateChild={onUpdateChild}
              onRemoveChild={onRemoveChild}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onNavigateToResource={onNavigateToResource}
            />
          ))}
          <div className="child-list-footer">
            <button
              type="button"
              className="child-footer-add-btn"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(1)}
              title="在末尾添加 1 个子项"
            >
              <Plus size={13} />
              <span>添加子项</span>
            </button>
            <button
              type="button"
              className="child-footer-bulk-btn"
              disabled={!isDeviceResourceEditable(project.device, resource.type)}
              onClick={() => addChildren(10)}
              title="在末尾批量添加 10 个子项"
            >
              +10 项
            </button>
          </div>
        </>
      )}
    </InspectorCard>
  );
}

type ChildDefinition = NonNullable<ResourceDefinition["child"]>;

interface ChildItemCardProps {
  project: WatchfaceProject;
  resourceId: string;
  resourceType: ResourceType;
  child: ResourceItem;
  index: number;
  childTag: string;
  childDefinition: ChildDefinition;
  isFlexLayout: boolean;
  isDragging: boolean;
  dropPosition: "before" | "after" | null;
  frameThumbSrc?: string;
  onUpdateChild: (childId: string, key: string, value: string) => void;
  onRemoveChild: (childId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, childId: string, index: number, label: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, childId: string) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>, childId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, childId: string, index: number) => void;
  onNavigateToResource: (resourceId: string) => void;
}

const ChildItemCard = memo(function ChildItemCard({
  project,
  resourceType,
  child,
  index,
  childTag,
  childDefinition,
  isFlexLayout,
  isDragging,
  dropPosition,
  frameThumbSrc,
  onUpdateChild,
  onRemoveChild,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onNavigateToResource,
}: ChildItemCardProps) {
  const rowClassName = [
    "child-card-row",
    isDragging ? "is-dragging" : "",
    dropPosition === "before" ? "drop-indicator-top" : "",
    dropPosition === "after" ? "drop-indicator-bottom" : "",
  ].filter(Boolean).join(" ");

  const singleField = childDefinition.fields.length === 1 ? childDefinition.fields[0] : undefined;
  const xyFields = childDefinition.fields.length === 3
    && childDefinition.fields.some((field: FieldDefinition) => field.key === "ref")
    && childDefinition.fields.some((field: FieldDefinition) => field.key === "x")
    && childDefinition.fields.some((field: FieldDefinition) => field.key === "y")
    ? {
        ref: childDefinition.fields.find((field: FieldDefinition) => field.key === "ref")!,
        x: childDefinition.fields.find((field: FieldDefinition) => field.key === "x")!,
        y: childDefinition.fields.find((field: FieldDefinition) => field.key === "y")!,
      }
    : undefined;
  const translationFields = childDefinition.fields.length === 2
    && childDefinition.fields.some((field: FieldDefinition) => field.key === "language")
    && childDefinition.fields.some((field: FieldDefinition) => field.key === "str")
    ? {
        language: childDefinition.fields.find((field: FieldDefinition) => field.key === "language")!,
        str: childDefinition.fields.find((field: FieldDefinition) => field.key === "str")!,
      }
    : undefined;

  const targetRef = (xyFields ? child.attrs[xyFields.ref.key] : singleField?.kind === "reference" ? child.attrs[singleField.key] : child.attrs.ref) || "";
  const targetResourceName = refName(targetRef);
  const targetResource = targetResourceName
    ? project.resources.find((entry: WatchfaceResource) => entry.attrs.name === targetResourceName)
    : undefined;

  const previewLabel = singleField ? (child.attrs[singleField.key] || `${childTag} #${index + 1}`)
    : translationFields ? `${child.attrs.language || "zh_CN"}: ${child.attrs.str || ""}`
    : `${childTag} #${index + 1}`;

  const renderField = (field: FieldDefinition) => {
    const value = child.attrs[field.key] ?? "";
    const set = (next: string) => onUpdateChild(child.id, field.key, next);
    const disabled = !isDeviceResourceEditable(project.device, resourceType)
      || !isDeviceAttributeEditable(project.device, `${resourceType}/${childTag}`, field.key);
    if (field.kind === "asset") {
      return <AssetPathSelect field={field} value={value} project={project} disabled={disabled} onChange={set} />;
    }
    if (field.kind === "reference") {
      const resources = project.resources.filter((entry: WatchfaceResource) => !field.referenceTypes || field.referenceTypes.includes(entry.type));
      return (
        <ResourceReferenceSelect value={value} project={project} resources={resources} disabled={disabled} onChange={set} />
      );
    }
    if (field.kind === "select") {
      return <select value={value} disabled={disabled} onChange={(event) => set(event.target.value)}><option value="">未设置</option>{value && !field.options?.includes(value) ? <option value={value}>{value}（非预设值）</option> : null}{field.options?.map((entry: string) => <option value={entry} key={entry}>{entry}</option>)}</select>;
    }
    if (field.kind === "dataSource") {
      const options = Object.entries(getDeviceProfile(project.device).dataSources.codes).map(([name, code]) => ({ value: name, label: DATA_SOURCE_LABELS[name] ?? name, detail: `${name} · ${code}` }));
      return (
        <div className="data-source-input">
          <ComboboxInput
            value={value}
            options={options}
            disabled={disabled}
            placeholder={field.required ? "必填" : "输入或选择数据源"}
            onChange={set}
          />
          {value && !isDataSourceSupported(project.device, value) ? <small>当前设备可能不支持此数据源。</small> : null}
        </div>
      );
    }
    return <input type={field.kind === "number" ? "number" : "text"} value={value} disabled={disabled} onChange={(event) => set(event.target.value)} />;
  };

  return (
    <div
      className={rowClassName}
      onDragOver={(event) => onDragOver(event, child.id)}
      onDragLeave={(event) => onDragLeave(event, child.id)}
      onDrop={(event) => onDrop(event, child.id, index)}
    >
      <div className="child-item-lead">
        <button
          className="child-drag-handle"
          draggable
          onDragStart={(event) => onDragStart(event, child.id, index, previewLabel)}
          onDragEnd={onDragEnd}
          title="拖动排序"
        >
          <GripVertical size={13} />
        </button>
        <span className="child-index-badge">{String(index).padStart(2, "0")}</span>
      </div>

      <div className="child-item-content">
        {singleField ? (
          <div className="child-field-single">
            {frameThumbSrc ? (
              <div className="child-thumb-wrap">
                <img className="child-thumb" src={frameThumbSrc} alt="" />
              </div>
            ) : null}
            <div className="child-field-control">{renderField(singleField)}</div>
            {targetResource ? (
              <button
                type="button"
                className="child-jump-btn"
                onClick={() => onNavigateToResource(targetResource.id)}
                title={`跳转到引用的资源 @${targetResource.attrs.name}（${RESOURCE_DEFINITION_MAP[targetResource.type]?.label || targetResource.type}）`}
              >
                <ArrowUpRight size={14} />
              </button>
            ) : null}
          </div>
        ) : translationFields ? (
          <div className="child-translation-fields">
            <div className="child-lang-col">{renderField(translationFields.language)}</div>
            <div className="child-str-col">{renderField(translationFields.str)}</div>
          </div>
        ) : xyFields ? (
          <div className="child-fields-compound">
            <div className="child-compound-row">
              <div className="child-ref-control-wrap">{renderField(xyFields.ref)}</div>
              {targetResource ? (
                <button
                  type="button"
                  className="child-jump-btn"
                  onClick={() => onNavigateToResource(targetResource.id)}
                  title={`跳转到引用的资源 @${targetResource.attrs.name}（${RESOURCE_DEFINITION_MAP[targetResource.type]?.label || targetResource.type}）`}
                >
                  <ArrowUpRight size={14} />
                </button>
              ) : null}
            </div>
            {isFlexLayout ? null : (
              <div className="child-xy-inputs">
                <div className="child-inline-field">
                  <span className="child-inline-tag">X</span>
                  {renderField(xyFields.x)}
                </div>
                <div className="child-inline-field">
                  <span className="child-inline-tag">Y</span>
                  {renderField(xyFields.y)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="child-fields-grid">
            {childDefinition.fields.map((field: FieldDefinition) => (
              <label className="child-grid-field" key={field.key}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                {renderField(field)}
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        className="child-delete-btn"
        onClick={() => onRemoveChild(child.id)}
        title="删除子项"
      >
        <X size={14} />
      </button>
    </div>
  );
});

function ResourceReferences({ resource }: { resource: WatchfaceResource }) {
  const project = useEditorStore((state) => state.project);
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const references = useMemo(
    () => findResourceReferences(project, resource),
    [project, resource.id, resource.attrs.name],
  );
  const [expanded, setExpanded] = useState(false);
  if (references.length === 0) return null;

  const labelFor = (reference: ResourceReference) => {
    switch (reference.kind) {
      case "watchface": return `表盘属性 · ${reference.fieldLabel}`;
      case "theme": return `主题「${reference.themeName}」· ${reference.fieldLabel}`;
      case "layout": return `主题「${reference.themeName}」· 布局元素`;
      case "resource": return `${reference.resourceType}「${reference.resourceName}」· ${reference.fieldLabel}`;
      case "child": return `${reference.resourceType}「${reference.resourceName}」· 子项 ${reference.childIndex + 1} · ${reference.fieldLabel}`;
    }
  };
  const jumpTo = (reference: ResourceReference) => {
    if (reference.kind === "watchface") navigateTo({ kind: "project" });
    else if (reference.kind === "theme") navigateTo({ kind: "theme", themeId: reference.themeId });
    else if (reference.kind === "layout") {
      navigateTo({ kind: "layout", themeId: reference.themeId, layoutId: reference.layoutId });
    } else navigateTo({ kind: "resource", resourceId: reference.resourceId });
  };

  return (
    <section className="resource-references">
      <button
        className="resource-references-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <Layers size={15} />
        <span>被 {references.length} 处引用</span>
        <ChevronDown size={15} />
      </button>
      {expanded ? <div className="resource-references-list">
        {references.map((reference, index) => (
          <button type="button" key={`${reference.kind}-${index}`} onClick={() => jumpTo(reference)} title="跳转到引用位置">
            <span>{labelFor(reference)}</span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div> : null}
    </section>
  );
}

function InspectorNavigation() {
  const selection = useEditorStore((state) => state.selection);
  const navigationBack = useEditorStore((state) => state.navigationBack);
  const navigationForward = useEditorStore((state) => state.navigationForward);
  const navigateBack = useEditorStore((state) => state.navigateBack);
  const navigateForward = useEditorStore((state) => state.navigateForward);

  let icon = <Sliders size={15} />;
  let title = "属性面板";

  if (selection.kind === "project") {
    icon = <FileText size={15} />;
    title = "项目配置";
  } else if (selection.kind === "theme") {
    icon = <Palette size={15} />;
    title = "主题属性";
  } else if (selection.kind === "layout") {
    icon = <Layers size={15} />;
    title = "布局节点";
  } else if (selection.kind === "resource") {
    icon = <Box size={15} />;
    title = "资源详情";
  }

  return (
    <nav className="inspector-navigation" aria-label="属性导航">
      <div className="inspector-navigation-target">
        <span className="inspector-navigation-icon">{icon}</span>
        <span className="inspector-navigation-title">{title}</span>
      </div>
      <div className="inspector-navigation-actions">
        <button
          type="button"
          disabled={navigationBack.length === 0}
          onClick={navigateBack}
          title="后退（Alt + ←）"
          aria-label="后退"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          disabled={navigationForward.length === 0}
          onClick={navigateForward}
          title="前进（Alt + →）"
          aria-label="前进"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </nav>
  );
}

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const selection = useEditorStore((state) => state.selection);
  const navigationBack = useEditorStore((state) => state.navigationBack);
  const navigationForward = useEditorStore((state) => state.navigationForward);
  const navigateBack = useEditorStore((state) => state.navigateBack);
  const navigateForward = useEditorStore((state) => state.navigateForward);
  const updateWatchface = useEditorStore((state) => state.updateWatchface);
  const updateDescription = useEditorStore((state) => state.updateDescription);
  const updateDevice = useEditorStore((state) => state.updateDevice);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const removeTheme = useEditorStore((state) => state.removeTheme);
  const updateLayout = useEditorStore((state) => state.updateLayout);
  const removeLayout = useEditorStore((state) => state.removeLayout);
  const updateResource = useEditorStore((state) => state.updateResource);
  const removeResource = useEditorStore((state) => state.removeResource);
  const removeChild = useEditorStore((state) => state.removeChild);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "ArrowLeft" && navigationBack.length > 0) {
        event.preventDefault();
        navigateBack();
      }
      if (event.altKey && event.key === "ArrowRight" && navigationForward.length > 0) {
        event.preventDefault();
        navigateForward();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateBack, navigateForward, navigationBack.length, navigationForward.length]);

  if (selection.kind === "project") {
    const firstTheme = project.themes[0];
    const firstThemePreviewUrl = getThemePreviewUrl(project, firstTheme);
    const previewTitle = firstTheme?.attrs.name
      ? `样式预览 · ${firstTheme.attrs.name}`
      : firstTheme
        ? "样式预览"
        : "项目图标";

    return (
      <aside className="inspector panel-surface">
        <InspectorNavigation />
        <InspectorHeader
          preview={
            <div className="resource-preview project-preview-box" title={previewTitle}>
              {firstThemePreviewUrl ? (
                <img
                  src={firstThemePreviewUrl}
                  alt={firstTheme?.attrs.name || "第一个样式预览图"}
                  className="project-preview-img"
                />
              ) : firstTheme && firstTheme.layouts.length > 0 ? (
                <MiniThemePreview project={project} theme={firstTheme} />
              ) : (
                <AppIcon size={32} />
              )}
            </div>
          }
          name={project.description.name || watchfaceDisplayName(project)}
          namePlaceholder="未命名项目"
          editTitle="编辑项目名称"
          dimensions={`${project.canvas.width} × ${project.canvas.height}`}
          onChange={(value) => updateDescription("name", value)}
        />
        <div className="inspector-body">
          <InspectorCard
            title="项目属性"
            icon={<FileText size={15} className="card-icon" />}
          >
            <div className="fields property-table">
              <div className="field-row">
                <label className="field-row-label" htmlFor="device-preset-select">
                  <span className="field-label-text">目标设备</span>
                </label>
                <div className="field-row-control">
                  <select id="device-preset-select" value={project.device} onChange={(event) => updateDevice(event.target.value as DeviceType)}>
                    {DEVICE_PROFILES.map((profile) => <option value={profile.id} key={profile.id}>{profile.label}</option>)}
                  </select>
                </div>
              </div>
              {DESCRIPTION_FIELDS.filter((field) => isFieldVisible(field, project.description) || Boolean(project.description[field.key])).map((field) => (
                <FieldInput
                  key={field.key}
                  field={{ ...field, required: isFieldRequired(field, project.description) }}
                  value={project.description[field.key] ?? ""}
                  project={project}
                  onChange={(value) => updateDescription(field.key, value)}
                />
              ))}
            </div>
          </InspectorCard>

          <InspectorCard
            title="表盘属性"
            icon={<Sliders size={15} className="card-icon" />}
          >
            <Fields fields={WATCHFACE_FIELDS} attrs={project.watchface} target="Watchface" onChange={updateWatchface} />
          </InspectorCard>
        </div>
      </aside>
    );
  }

  if (selection.kind === "theme") {
    const theme = project.themes.find((entry) => entry.id === selection.themeId);
    if (!theme) return null;
    const themePreviewUrl = getThemePreviewUrl(project, theme);
    const themeTitle = theme.attrs.name
      ? `主题预览 · ${theme.attrs.name}`
      : theme.attrs.type === "AOD"
        ? "息屏主题"
        : "普通主题";

    return (
      <aside className="inspector panel-surface">
        <InspectorNavigation />
        {/* 主题名称在标题上编辑，字段列表不再单列 */}
        <InspectorHeader
          preview={
            <div
              className="resource-preview theme-preview-box"
              title={themeTitle}
              style={{ backgroundColor: theme.attrs.bgColor || "#000000" }}
            >
              {themePreviewUrl ? (
                <img
                  src={themePreviewUrl}
                  alt={theme.attrs.name || "主题预览图"}
                  className="project-preview-img"
                />
              ) : theme.layouts.length > 0 ? (
                <MiniThemePreview project={project} theme={theme} />
              ) : (
                <Palette size={22} color={theme.attrs.type === "AOD" ? "#8e9599" : "#38a096"} />
              )}
            </div>
          }
          name={theme.attrs.name || ""}
          namePlaceholder="未命名主题"
          editTitle="编辑主题名称"
          dimensions={`${project.canvas.width} × ${project.canvas.height}`}
          onChange={(value) => updateTheme(theme.id, "name", value)}
        />
        <div className="inspector-body">
          {/* preview 预览图由保存流程自动生成，不允许手动编辑 */}
          <InspectorCard
            title="主题属性"
            icon={<Palette size={15} className="card-icon" />}
          >
            <Fields fields={THEME_FIELDS.filter((field) => field.key !== "preview" && field.key !== "name")} attrs={theme.attrs} target="Theme" onChange={(key, value) => updateTheme(theme.id, key, value)} />
          </InspectorCard>
          <section className="inspector-danger-card">
            <button
              disabled={project.themes.length <= 1}
              onClick={async () => {
                const ok = await dialogManager.confirm({
                  title: "删除主题",
                  message: `确定要删除主题 "${theme.attrs.name || "未命名主题"}" 吗？此操作不可撤销。`,
                  confirmText: "删除主题",
                  danger: true,
                });
                if (ok) removeTheme(theme.id);
              }}
            >
              <X size={15} />删除主题
            </button>
          </section>
        </div>
      </aside>
    );
  }

  if (selection.kind === "layout") {
    const theme = project.themes.find((entry) => entry.id === selection.themeId);
    const layout = theme?.layouts.find((entry) => entry.id === selection.layoutId);
    if (!theme || !layout) return null;
    const resource = project.resources.find((entry) => `@${entry.attrs.name}` === layout.attrs.ref);
    const resourceEditable = resource ? isDeviceResourceEditable(project.device, resource.type) : false;
    return (
      <aside className="inspector panel-surface">
        <InspectorNavigation />
        <ResourceInspectorHeader
          key={layout.id}
          resource={resource}
          editable={resourceEditable}
          onNameChange={resource ? (value) => updateResource(resource.id, "name", value) : undefined}
          namePrefix="@"
          fallbackRef={layout.attrs.ref}
        />
        <div className="inspector-body">
          <InspectorCard
            title="布局坐标"
            icon={<Sliders size={15} className="card-icon" />}
          >
            <Fields fields={LAYOUT_FIELDS} attrs={layout.attrs} target="Layout" onChange={(key, value) => updateLayout(theme.id, layout.id, { [key]: value })} />
          </InspectorCard>

          <section className="inspector-danger-card">
            <button
              onClick={async () => {
                const ok = await dialogManager.confirm({
                  title: "删除布局元素",
                  message: `确定要删除布局元素 "${layout.attrs.ref}" 吗？`,
                  confirmText: "删除布局",
                  danger: true,
                });
                if (ok) removeLayout(theme.id, layout.id);
              }}
            >
              <X size={15} />删除布局
            </button>
          </section>
        </div>
      </aside>
    );
  }

  const resource = project.resources.find((entry) => entry.id === selection.resourceId);
  if (!resource) return null;
  const definition = RESOURCE_DEFINITION_MAP[resource.type];
  const resourceEditable = isDeviceResourceEditable(project.device, resource.type);
  const definitionFields = definition.fields.filter((field) => field.key !== "name" && !field.hidden);
  const commonFields = definitionFields.filter((field) => field.section === "common");
  const resourceFields = definitionFields.filter((field) => !field.section);
  const conditionalSections = ([
    ["normal", "普通文本"],
    ["arc", "圆弧文本"],
    ["system", "系统组件"],
    ["application", "应用参数"],
    ["flex", "自动布局"],
  ] as const).map(([key, label]) => ({ key, label, fields: definitionFields.filter((field) => field.section === key) }))
    .filter((section) => section.fields.some((field) => isFieldVisible(field, resource.attrs) || Boolean(resource.attrs[field.key])));
  const changeResource = async (key: string, value: string) => {
    if (resource.type === "DataItemText" && key === "style" && value !== resource.attrs.style) {
      const clearKeys = value === "arc" ? ["w", "h", "lineSpace", "longMode"] : ["radius", "verticalAlign", "startAngle", "span"];
      if (clearKeys.some((entry) => resource.attrs[entry])) {
        const ok = await dialogManager.confirm({
          title: "属性调整确认",
          message: "切换文本布局会清除当前布局不适用的属性，是否继续？",
          confirmText: "继续切换",
        });
        if (!ok) return;
      }
      clearKeys.forEach((entry) => updateResource(resource.id, entry, ""));
    }
    if (resource.type === "Slot" && key === "type" && value !== resource.attrs.type) {
      if (resource.children.length > 0 && value !== "widget") {
        const ok = await dialogManager.confirm({
          title: "切换槽位类型",
          message: "切换槽位类型会清除当前 Widget 选项，是否继续？",
          confirmText: "清除并切换",
          danger: true,
        });
        if (!ok) return;
      }
      if (value !== "widget") resource.children.forEach((child) => removeChild(resource.id, child.id));
      if (value !== "appWidget") updateResource(resource.id, "appWidgetID", "");
    }
    if (resource.type === "Widget" && key === "jumpApp" && !["jsApplication", "luaApplication"].includes(value) && resource.attrs.args) {
      const ok = await dialogManager.confirm({
        title: "应用参数清除确认",
        message: "新的应用类型不使用参数文件，是否清除 args？",
        confirmText: "清除 args",
      });
      if (!ok) return;
      updateResource(resource.id, "args", "");
    }
    if (resource.type === "Widget" && key === "flex_direction" && !value) {
      const clearKeys = ["justify_content", "align_content", "align_items", "gap"];
      if (clearKeys.some((entry) => resource.attrs[entry])) {
        const ok = await dialogManager.confirm({
          title: "关闭自动布局",
          message: "关闭自动布局会清除其对齐与间距属性，是否继续？",
          confirmText: "清除并关闭",
        });
        if (!ok) return;
      }
      clearKeys.forEach((entry) => updateResource(resource.id, entry, ""));
    }
    updateResource(resource.id, key, value);
  };
    return (
      <aside className="inspector panel-surface">
        <InspectorNavigation />
        <ResourceInspectorHeader
          key={resource.id}
          resource={resource}
          definition={definition}
          editable={resourceEditable}
          onNameChange={(value) => changeResource("name", value)}
        />
        <ResourceReferences resource={resource} />
      <div className="inspector-body">
        {resourceFields.length > 0 ? (
          <InspectorCard
            title="基础属性"
            icon={<Sliders size={15} className="card-icon" />}
          >
            <Fields fields={resourceFields} attrs={resource.attrs} target={resource.type} resourceType={resource.type} resource={resource} onChange={changeResource} />
          </InspectorCard>
        ) : null}

        {conditionalSections.map((section) => (
          <InspectorCard
            key={section.key}
            title={section.label}
            icon={<Sparkles size={15} className="card-icon" />}
          >
            <Fields fields={section.fields} attrs={resource.attrs} target={resource.type} resourceType={resource.type} resource={resource} onChange={changeResource} />
          </InspectorCard>
        ))}

        {commonFields.length > 0 ? (
          <InspectorCard
            title="通用属性"
            icon={<Settings size={15} className="card-icon" />}
          >
            <Fields fields={commonFields} attrs={resource.attrs} target={resource.type} resourceType={resource.type} resource={resource} onChange={changeResource} />
            <small className="field-note">空值表示使用编译器默认值。</small>
          </InspectorCard>
        ) : null}

        {definition.child ? <ChildEditor resource={resource} childDefinition={definition.child} /> : null}

        <section className="inspector-danger-card">
          <button
            onClick={async () => {
              const name = resource.attrs.name || RESOURCE_DEFINITION_MAP[resource.type].label;
              const ok = await dialogManager.confirm({
                title: "删除资源",
                message: `确定要删除资源 "${name}" 吗？引用该资源的布局可能会受到影响。`,
                confirmText: "删除资源",
                danger: true,
              });
              if (ok) removeResource(resource.id);
            }}
          >
            <X size={15} />删除资源
          </button>
        </section>
      </div>
    </aside>
  );
}
