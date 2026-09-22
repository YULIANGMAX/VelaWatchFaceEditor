import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  File,
  Folder,
  FolderInput,
  FolderTree,
  GripVertical,
  Layers3,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createResourceFolder,
  createAssetImportCandidates,
  deleteResourceFile,
  deleteResourceFolder,
  moveResourceFiles,
  moveResourceFolder,
  readResourceLibrary,
  renameResourceFile,
  renameResourceFolder,
  writeResourceAssets,
  type AssetImportCandidate,
  type ResourceFileProgress,
} from "../core/projectIO";
import { RESOURCE_DEFINITION_MAP } from "../editor/manifestEditorSchema";
import { measureResource } from "../core/measure";
import { getResourceName, isPreviewResource, isReservedAssetFolder, normalizePath, type ProjectAsset, type WatchfacePreviewContext, type WatchfaceProject, type WatchfaceResource } from "../core/model";
import { useEditorStore } from "../store/editorStore";
import { ResourceRenderer } from "./ResourceRenderer";
import { AddResourceDialog } from "./AddResourceDialog";
import { AssetConflictDialog, type AssetConflict } from "./AssetConflictDialog";
import { FileOperationProgressDialog, type FileOperationState } from "./FileOperationProgressDialog";
import { setDragGhost } from "../core/dragGhost";
import { dialogManager } from "../core/dialog";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

type SidebarTab = "layouts" | "resources" | "files";

const RESOURCE_GROUP_ORDER = ["基础", "数据", "组合"] as const;
type ResourceGroupName = (typeof RESOURCE_GROUP_ORDER)[number];

interface AssetTreeNode {
  name: string;
  path: string;
  folders: Map<string, AssetTreeNode>;
  files: ProjectAsset[];
}

interface PendingAssetImport {
  assets: Record<string, ProjectAsset>;
  folders: string[];
  conflicts: AssetConflict[];
  index: number;
  incoming: AssetImportCandidate[];
}

function addParentFolders(path: string, folders: Set<string>): void {
  const parts = normalizePath(path).split("/").filter(Boolean);
  parts.pop();
  for (let index = 1; index <= parts.length; index += 1) {
    folders.add(parts.slice(0, index).join("/"));
  }
}

function createAssetTree(assets: Record<string, ProjectAsset>, folders: string[]): AssetTreeNode {
  const root: AssetTreeNode = { name: "resources", path: "", folders: new Map(), files: [] };
  const ensureFolder = (path: string): AssetTreeNode => {
    let node = root;
    let currentPath = "";
    for (const part of normalizePath(path).split("/").filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let child = node.folders.get(part);
      if (!child) {
        child = { name: part, path: currentPath, folders: new Map(), files: [] };
        node.folders.set(part, child);
      }
      node = child;
    }
    return node;
  };

  for (const folder of folders) ensureFolder(folder);
  for (const asset of Object.values(assets)) {
    const parts = asset.path.split("/");
    parts.pop();
    ensureFolder(parts.join("/")).files.push(asset);
  }
  return root;
}

function getVisibleAssetPaths(node: AssetTreeNode, collapsed: Set<string>, paths: string[] = []): string[] {
  if (collapsed.has(node.path)) return paths;
  const folders = [...node.folders.values()].sort((left, right) => left.name.localeCompare(right.name));
  for (const folder of folders) getVisibleAssetPaths(folder, collapsed, paths);
  for (const asset of [...node.files].sort((left, right) => left.path.localeCompare(right.path))) {
    paths.push(asset.path);
  }
  return paths;
}

function initialProgress(paths: string[], assets: Record<string, ProjectAsset>): ResourceFileProgress {
  const entries = paths.map((path) => assets[path]).filter(Boolean);
  return {
    currentPath: paths[0] ?? "",
    completedFiles: 0,
    totalFiles: entries.length,
    writtenBytes: 0,
    totalBytes: entries.reduce((sum, asset) => sum + asset.blob.size, 0),
  };
}

function isImage(asset: ProjectAsset): boolean {
  return asset.blob.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(asset.path);
}



function AssetTreeBranch({
  node,
  depth,
  activeFolder,
  collapsed,
  onSelectFolder,
  onToggleFolder,
  selectedAssetPaths,
  onSelectFile,
  onStartFileDrag,
  onEndFileDrag,
  onDropFiles,
  onDropFolder,
  onImportFiles,
  onRenameFile,
  onDeleteFile,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  node: AssetTreeNode;
  depth: number;
  activeFolder: string;
  collapsed: Set<string>;
  onSelectFolder: (path: string) => void;
  onToggleFolder: (path: string) => void;
  selectedAssetPaths: Set<string>;
  onSelectFile: (path: string, event: MouseEvent<HTMLDivElement>) => void;
  onStartFileDrag: (path: string, event: DragEvent<HTMLDivElement>) => void;
  onEndFileDrag: () => void;
  onDropFiles: (sourcePaths: string[], targetFolder: string) => void;
  onDropFolder: (sourcePath: string, targetFolder: string) => void;
  onImportFiles: (targetFolder: string) => void;
  onRenameFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onCreateFolder: (parentFolder: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
}) {
  const isCollapsed = collapsed.has(node.path);
  const folders = [...node.folders.values()].sort((left, right) => left.name.localeCompare(right.name));
  const files = [...node.files].sort((left, right) => left.path.localeCompare(right.path));
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceFolder = event.dataTransfer.getData("application/x-watchface-folder");
    if (sourceFolder) {
      onDropFolder(sourceFolder, node.path);
      return;
    }
    const encodedPaths = event.dataTransfer.getData("application/x-watchface-assets");
    if (!encodedPaths) {
      onDropFiles([], node.path);
      return;
    }
    try {
      const paths: unknown = JSON.parse(encodedPaths);
      if (Array.isArray(paths) && paths.every((path) => typeof path === "string")) onDropFiles(paths, node.path);
    } catch {
      return;
    }
  };

  const isReserved = isReservedAssetFolder(node.path);

  return (
    <div className="asset-tree-branch">
      <div
        className={`asset-folder-row${activeFolder === node.path ? " is-active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
        onDrop={drop}
        draggable={Boolean(node.path) && !isReserved}
        onDragStart={(event) => {
          if (!node.path || isReserved) return;
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-watchface-folder", node.path);
        }}
        title={isReserved ? "系统保留文件夹（自动生成，不可重命名或删除）" : node.path ? "拖到其他文件夹可移动" : "可接收文件或文件夹"}
      >
        <button className="asset-folder-toggle" onClick={() => onToggleFolder(node.path)} title={isCollapsed ? "展开" : "折叠"}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <button className="asset-folder-main" onClick={() => onSelectFolder(node.path)}>
          <Folder size={16} />
          <strong>{node.name}</strong>
          <small>{node.folders.size + node.files.length}</small>
        </button>
        <div className="asset-folder-actions">
          <button onClick={() => onImportFiles(node.path)} title="导入文件"><FolderInput size={14} /></button>
          <button onClick={() => onCreateFolder(node.path)} title="新建子文件夹"><Plus size={14} /></button>
          {node.path && !isReserved ? <button onClick={() => onRenameFolder(node.path)} title="重命名文件夹"><Pencil size={14} /></button> : null}
          {node.path && !isReserved ? <button className="is-danger" onClick={() => onDeleteFolder(node.path)} title="永久删除文件夹"><X size={14} /></button> : null}
        </div>
      </div>
      {!isCollapsed ? (
        <div
          className="asset-folder-contents"
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={drop}
        >
          {folders.map((folder) => (
            <AssetTreeBranch
              key={folder.path}
              node={folder}
              depth={depth + 1}
              activeFolder={activeFolder}
              collapsed={collapsed}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              selectedAssetPaths={selectedAssetPaths}
              onSelectFile={onSelectFile}
              onStartFileDrag={onStartFileDrag}
              onEndFileDrag={onEndFileDrag}
              onDropFiles={onDropFiles}
              onDropFolder={onDropFolder}
              onImportFiles={onImportFiles}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
          {files.map((asset) => (
            <AssetTreeFileRow
              key={asset.path}
              asset={asset}
              depth={depth}
              isSelected={selectedAssetPaths.has(asset.path)}
              onSelectFile={onSelectFile}
              onStartFileDrag={onStartFileDrag}
              onEndFileDrag={onEndFileDrag}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface AssetTreeFileRowProps {
  asset: ProjectAsset;
  depth: number;
  isSelected: boolean;
  onSelectFile: (path: string, event: MouseEvent<HTMLDivElement>) => void;
  onStartFileDrag: (path: string, event: DragEvent<HTMLDivElement>) => void;
  onEndFileDrag: () => void;
  onRenameFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
}

const AssetTreeFileRow = memo(function AssetTreeFileRow({
  asset,
  depth,
  isSelected,
  onSelectFile,
  onStartFileDrag,
  onEndFileDrag,
  onRenameFile,
  onDeleteFile,
}: AssetTreeFileRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  const filename = asset.path.split("/").at(-1);
  return (
    <div
      ref={rowRef}
      className={`asset-tree-file${isSelected ? " is-selected" : ""}`}
      style={{ paddingLeft: 30 + depth * 14 }}
      draggable
      aria-selected={isSelected}
      onClick={(event) => onSelectFile(asset.path, event)}
      onDragStart={(event) => onStartFileDrag(asset.path, event)}
      onDragEnd={onEndFileDrag}
      title="单击选择；Ctrl 多选；Shift 连选；拖到文件夹可移动"
    >
      {isImage(asset) ? <span className="asset-tree-thumb"><img src={asset.url} alt="" /></span> : <File size={16} />}
      <span className="asset-tree-file-label"><strong>{filename}</strong><small>{asset.path}</small></span>
      <div className="asset-file-actions">
        <button onClick={(event) => { event.stopPropagation(); onRenameFile(asset.path); }} title="重命名文件"><Pencil size={14} /></button>
        <button className="is-danger" onClick={(event) => { event.stopPropagation(); onDeleteFile(asset.path); }} title="永久删除文件"><X size={14} /></button>
      </div>
    </div>
  );
});

const ResourceRowThumb = memo(function ResourceRowThumb({
  project,
  resource,
  preview,
  now,
}: {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  preview: WatchfacePreviewContext;
  now: Date;
}) {
  const dimensions = measureResource(project, resource, preview.color);
  const rendererRef = useRef<HTMLSpanElement>(null);
  const hasKnownSize =
    (dimensions.width > 0 && dimensions.height > 0) ||
    (Number(resource.attrs.w) > 0 && Number(resource.attrs.h) > 0);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (hasKnownSize) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const measure = () => {
      const width = renderer.scrollWidth;
      const height = renderer.scrollHeight;
      if (!width || !height) return;
      setRenderedSize((current) => current?.width === width && current?.height === height ? current : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(renderer);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [hasKnownSize, project, resource]);
  const width = (hasKnownSize ? (dimensions.width || Number(resource.attrs.w)) : renderedSize?.width) || dimensions.width || Number(resource.attrs.w) || 120;
  const height = (hasKnownSize ? (dimensions.height || Number(resource.attrs.h)) : renderedSize?.height) || dimensions.height || Number(resource.attrs.h) || 32;
  const scale = Math.min(1, 34 / width, 34 / height);
  const offsetX = (34 - width * scale) / 2;
  const offsetY = (34 - height * scale) / 2;
  return (
    <span className="resource-row-thumb" title={`静态预览：${RESOURCE_DEFINITION_MAP[resource.type].label}`}>
      <span ref={rendererRef} className="resource-row-thumb-renderer" style={{ left: `${offsetX}px`, top: `${offsetY}px`, transform: `scale(${scale})` }}>
        <ResourceRenderer
          project={project}
          resource={resource}
          resourceName={resource.attrs.name || resource.id}
          now={now}
          preview={preview}
          frameIndex={0}
        />
      </span>
    </span>
  );
});

interface ResourceRowItemProps {
  project: WatchfaceProject;
  resource: WatchfaceResource;
  actualIndex: number;
  selected: boolean;
  isDragging: boolean;
  dropPosition: "before" | "after" | null;
  sameGroup: boolean;
  thumbnailPreview: WatchfacePreviewContext;
  thumbnailNow: Date;
  onSelect: (resourceId: string) => void;
  onDuplicate: (resourceId: string) => void;
  onAddLayout: (resourceId: string) => void;
  onDragStart: (resource: WatchfaceResource, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (resourceId: string, sameGroup: boolean, event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (resourceId: string, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (resourceId: string, actualIndex: number, sameGroup: boolean, event: DragEvent<HTMLDivElement>) => void;
}

const ResourceRowItem = memo(function ResourceRowItem({
  project,
  resource,
  actualIndex,
  selected,
  isDragging,
  dropPosition,
  sameGroup,
  thumbnailPreview,
  thumbnailNow,
  onSelect,
  onDuplicate,
  onAddLayout,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ResourceRowItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [selected]);

  const rowClassName = [
    "resource-row",
    selected ? "is-selected" : "",
    isDragging ? "is-dragging" : "",
    dropPosition === "before" ? "drop-indicator-top" : "",
    dropPosition === "after" ? "drop-indicator-bottom" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={rowRef}
      className={rowClassName}
      onDragOver={(event) => onDragOver(resource.id, sameGroup, event)}
      onDragLeave={(event) => onDragLeave(resource.id, event)}
      onDrop={(event) => onDrop(resource.id, actualIndex, sameGroup, event)}
    >
      <button
        className="layout-drag-handle"
        draggable
        onDragStart={(event) => onDragStart(resource, event)}
        onDragEnd={onDragEnd}
        title="拖动排序"
      >
        <GripVertical size={13} />
      </button>
      <button className="resource-row-main" onClick={() => onSelect(resource.id)}>
        <ResourceRowThumb project={project} resource={resource} preview={thumbnailPreview} now={thumbnailNow} />
        <span><strong>{getResourceName(resource)}</strong><small>{RESOURCE_DEFINITION_MAP[resource.type].label}</small></span>
      </button>
      <button className="resource-copy" onClick={() => onDuplicate(resource.id)} title="复制资源"><Copy size={14} /></button>
      <button className="resource-add-canvas" onClick={() => onAddLayout(resource.id)} title="添加到当前主题"><Plus size={15} /></button>
    </div>
  );
});

export function Sidebar({ projectDirectory }: { projectDirectory: FileSystemDirectoryHandle | null }) {
  const project = useEditorStore((state) => state.project);
  const selectedThemeId = useEditorStore((state) => state.selectedThemeId);
  const selection = useEditorStore((state) => state.selection);
  const previewColor = useEditorStore((state) => state.previewColor);
  const previewTemperatureUnit = useEditorStore((state) => state.previewTemperatureUnit);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const setSelection = useEditorStore((state) => state.setSelection);
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const lastSelectedResourceIdRef = useRef<string | null>(null);
  const lastSelectedLayoutIdRef = useRef<string | null>(null);

  const selectedLayoutRowRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      node.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    if (selection.kind !== "resource") {
      lastSelectedResourceIdRef.current = null;
      return;
    }
    const resourceIdChanged = lastSelectedResourceIdRef.current !== selection.resourceId;
    lastSelectedResourceIdRef.current = selection.resourceId;
    if (!resourceIdChanged) return;

    setTab("resources");
    const resource = project.resources.find((entry) => entry.id === selection.resourceId);
    if (resource) {
      const group = RESOURCE_DEFINITION_MAP[resource.type].group as ResourceGroupName;
      setCollapsedResourceGroups((current) => {
        if (!current.has(group)) return current;
        const next = new Set(current);
        next.delete(group);
        return next;
      });
    }
    const scrollSelected = () => {
      document.querySelector(".resource-row.is-selected")?.scrollIntoView({ block: "center", behavior: "auto" });
    };
    scrollSelected();
    window.requestAnimationFrame(scrollSelected);
  }, [project.resources, selection]);

  useEffect(() => {
    if (selection.kind !== "layout") {
      lastSelectedLayoutIdRef.current = null;
      return;
    }
    const layoutIdChanged = lastSelectedLayoutIdRef.current !== selection.layoutId;
    lastSelectedLayoutIdRef.current = selection.layoutId;
    if (!layoutIdChanged) return;

    setTab("layouts");
    const scrollSelected = () => {
      document.querySelector(".layout-row.is-selected")?.scrollIntoView({ block: "center", behavior: "auto" });
    };
    scrollSelected();
    window.requestAnimationFrame(scrollSelected);
  }, [selection]);

  const addLayout = useEditorStore((state) => state.addLayout);
  const duplicateLayout = useEditorStore((state) => state.duplicateLayout);
  const reorderLayout = useEditorStore((state) => state.reorderLayout);
  const removeLayout = useEditorStore((state) => state.removeLayout);
  const moveLayout = useEditorStore((state) => state.moveLayout);
  const updateLayout = useEditorStore((state) => state.updateLayout);
  const reorderResource = useEditorStore((state) => state.reorderResource);
  const duplicateResource = useEditorStore((state) => state.duplicateResource);
  const replaceAssetLibrary = useEditorStore((state) => state.replaceAssetLibrary);
  const syncAssetLibrary = useEditorStore((state) => state.syncAssetLibrary);
  const renameAsset = useEditorStore((state) => state.renameAsset);
  const removeAsset = useEditorStore((state) => state.removeAsset);
  const addAssetFolder = useEditorStore((state) => state.addAssetFolder);
  const removeAssetFolder = useEditorStore((state) => state.removeAssetFolder);
  const moveAssets = useEditorStore((state) => state.moveAssets);
  const moveAssetFolder = useEditorStore((state) => state.moveAssetFolder);
  const renameAssetFolder = useEditorStore((state) => state.renameAssetFolder);
  const [tab, setTab] = useState<SidebarTab>("layouts");
  const [thumbnailNow, setThumbnailNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedLayoutId, setDraggedLayoutId] = useState<string | null>(null);
  const [dropTargetLayout, setDropTargetLayout] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [draggedResourceId, setDraggedResourceId] = useState<string | null>(null);
  const [collapsedResourceGroups, setCollapsedResourceGroups] = useState<Set<ResourceGroupName>>(() => new Set(RESOURCE_GROUP_ORDER));
  const [dropTargetResource, setDropTargetResource] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [activeFolder, setActiveFolder] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(project.assetFolders ?? []),
  );

  const selectedResourceId = selection.kind === "resource" ? selection.resourceId : null;
  const resourceIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    project.resources.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [project.resources]);

  const handleSelectResource = useCallback((resourceId: string) => {
    setSelection({ kind: "resource", resourceId });
  }, [setSelection]);

  const handleDragStart = useCallback((resource: WatchfaceResource, event: DragEvent<HTMLButtonElement>) => {
    setDraggedResourceId(resource.id);
    event.dataTransfer.effectAllowed = "move";
    setDragGhost(event, getResourceName(resource), RESOURCE_DEFINITION_MAP[resource.type].label);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedResourceId(null);
    setDropTargetResource(null);
  }, []);

  const handleDragOver = useCallback((resourceId: string, sameGroup: boolean, event: DragEvent<HTMLDivElement>) => {
    if (sameGroup && draggedResourceId !== resourceId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setDropTargetResource((current) => (current?.id === resourceId && current.position === position ? current : { id: resourceId, position }));
    }
  }, [draggedResourceId]);

  const handleDragLeave = useCallback((resourceId: string, event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropTargetResource((current) => (current?.id === resourceId ? null : current));
    }
  }, []);

  const handleDrop = useCallback((resourceId: string, actualIndex: number, sameGroup: boolean, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (sameGroup && draggedResourceId && draggedResourceId !== resourceId && dropTargetResource) {
      const sourceIndex = project.resources.findIndex((r) => r.id === draggedResourceId);
      const targetIndex = actualIndex;
      let finalIndex = targetIndex;
      if (dropTargetResource.position === "before") {
        finalIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      } else {
        finalIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
      }
      reorderResource(draggedResourceId, Math.max(0, Math.min(project.resources.length - 1, finalIndex)));
    }
    setDraggedResourceId(null);
    setDropTargetResource(null);
  }, [draggedResourceId, dropTargetResource, project.resources, reorderResource]);
  const thumbnailPreview = useMemo<WatchfacePreviewContext>(() => {
    const colors = (project.watchface.colorGroupTable || project.watchface.recolorTable || "")
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean);
    return {
      color: colors.includes(previewColor) ? previewColor : colors[0] ?? "",
      elapsedMs: 0,
      temperatureUnit: previewTemperatureUnit,
      metrics: previewMetrics,
    };
  }, [previewColor, previewMetrics, previewTemperatureUnit, project.watchface.colorGroupTable, project.watchface.recolorTable]);
  useEffect(() => {
    if (tab !== "resources") return;
    const timer = window.setInterval(() => setThumbnailNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [tab]);
  const [pendingImport, setPendingImport] = useState<PendingAssetImport | null>(null);
  const [selectedAssetPaths, setSelectedAssetPaths] = useState<Set<string>>(new Set());
  const [fileOperation, setFileOperation] = useState<FileOperationState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTargetFolderRef = useRef("");
  const selectionAnchorRef = useRef("");
  const draggedAssetPathsRef = useRef<string[]>([]);
  const projectAssetsRef = useRef(project.assets);
  const assetFoldersRef = useRef(project.assetFolders ?? []);
  const resourceRevisionRef = useRef(0);
  const resourceMutationActiveRef = useRef(false);
  projectAssetsRef.current = project.assets;
  assetFoldersRef.current = project.assetFolders ?? [];
  const theme = project.themes.find((entry) => entry.id === selectedThemeId) ?? project.themes[0];

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    layoutId: string;
  } | null>(null);

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

  useEffect(() => {
    setCollapsedFolders(new Set(useEditorStore.getState().project.assetFolders ?? []));
    setSelectedAssetPaths(new Set());
    selectionAnchorRef.current = "";
    setActiveFolder("");
  }, [projectDirectory]);

  const filteredResources = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    const visible = project.resources.filter((resource) => !isPreviewResource(resource));
    if (!keyword) return visible;
    return visible.filter((resource) =>
      `${getResourceName(resource)} ${resource.type}`.toLocaleLowerCase().includes(keyword),
    );
  }, [project.resources, search]);

  const groupedResources = useMemo(() => {
    const byGroup = new Map<ResourceGroupName, WatchfaceResource[]>();
    for (const resource of filteredResources) {
      const group = RESOURCE_DEFINITION_MAP[resource.type].group as ResourceGroupName;
      let bucket = byGroup.get(group);
      if (!bucket) {
        bucket = [];
        byGroup.set(group, bucket);
      }
      bucket.push(resource);
    }
    return RESOURCE_GROUP_ORDER.filter((name) => byGroup.has(name)).map((name) => ({
      name,
      count: byGroup.get(name)!.length,
      resources: byGroup.get(name)!,
    }));
  }, [filteredResources]);

  const assetTree = useMemo(() => {
    return createAssetTree(project.assets, project.assetFolders ?? []);
  }, [project.assets, project.assetFolders]);
  const visibleAssetPaths = useMemo(
    () => getVisibleAssetPaths(assetTree, collapsedFolders),
    [assetTree, collapsedFolders],
  );

  const startResourceMutation = () => {
    resourceRevisionRef.current += 1;
    resourceMutationActiveRef.current = true;
  };

  const finishResourceMutation = () => {
    const latestProject = useEditorStore.getState().project;
    projectAssetsRef.current = latestProject.assets;
    assetFoldersRef.current = latestProject.assetFolders ?? [];
    resourceMutationActiveRef.current = false;
  };

  useEffect(() => {
    if (!projectDirectory) return;
    let stopped = false;
    let scanning = false;
    const releaseNewUrls = (assets: Record<string, ProjectAsset>, baseline: Record<string, ProjectAsset>) => {
      for (const [path, asset] of Object.entries(assets)) {
        if (baseline[path] !== asset) URL.revokeObjectURL(asset.url);
      }
    };
    const scan = async () => {
      if (scanning || resourceMutationActiveRef.current) return;
      scanning = true;
      const revision = resourceRevisionRef.current;
      const baselineAssets = projectAssetsRef.current;
      try {
        const snapshot = await readResourceLibrary(projectDirectory, baselineAssets);
        if (stopped || revision !== resourceRevisionRef.current || resourceMutationActiveRef.current) {
          releaseNewUrls(snapshot.assets, baselineAssets);
          return;
        }
        const currentFolders = assetFoldersRef.current;
        const currentPaths = Object.keys(baselineAssets).sort();
        const nextPaths = Object.keys(snapshot.assets).sort();
        const filesChanged = currentPaths.length !== nextPaths.length
          || currentPaths.some((path, index) => path !== nextPaths[index] || baselineAssets[path] !== snapshot.assets[path]);
        const foldersChanged = currentFolders.length !== snapshot.folders.length
          || currentFolders.some((path, index) => path !== snapshot.folders[index]);
        if (!filesChanged && !foldersChanged) return;
        for (const [path, asset] of Object.entries(baselineAssets)) {
          if (snapshot.assets[path] !== asset) URL.revokeObjectURL(asset.url);
        }
        projectAssetsRef.current = snapshot.assets;
        assetFoldersRef.current = snapshot.folders;
        syncAssetLibrary(snapshot.assets, snapshot.folders);
        setSelectedAssetPaths((current) => new Set([...current].filter((path) => snapshot.assets[path])));
        setCollapsedFolders((current) => {
          const next = new Set([...current].filter((path) => snapshot.folders.includes(path)));
          for (const path of snapshot.folders) {
            if (!currentFolders.includes(path)) next.add(path);
          }
          return next;
        });
        setActiveFolder((current) => current === "" || snapshot.folders.includes(current) ? current : "");
        if (selectionAnchorRef.current && !snapshot.assets[selectionAnchorRef.current]) selectionAnchorRef.current = "";
      } catch (error) {
        console.error("同步 resources 目录失败", error);
      } finally {
        scanning = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void scan();
    };
    window.addEventListener("focus", scan);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void scan();
    return () => {
      stopped = true;
      window.removeEventListener("focus", scan);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [projectDirectory, syncAssetLibrary]);

  const persistImport = async (
    assets: Record<string, ProjectAsset>,
    folders: string[],
    incoming: AssetImportCandidate[],
  ) => {
    const selectedAssets = incoming
      .map((candidate) => candidate.asset)
      .filter((asset, index, all) => assets[asset.path] === asset && all.indexOf(asset) === index);
    if (selectedAssets.length === 0 || !projectDirectory) {
      replaceAssetLibrary(assets, folders);
      return;
    }
    startResourceMutation();
    setFileOperation({ kind: "import", progress: initialProgress(selectedAssets.map((asset) => asset.path), assets) });
    try {
      await writeResourceAssets(projectDirectory, selectedAssets, (progress) => {
        setFileOperation({ kind: "import", progress });
      });
      replaceAssetLibrary(assets, folders);
    } catch (error) {
      for (const candidate of incoming) URL.revokeObjectURL(candidate.asset.url);
      void dialogManager.alert({
        title: "导入资源失败",
        message: error instanceof Error ? error.message : "导入资源失败",
        type: "error",
      });
    } finally {
      setFileOperation(null);
      finishResourceMutation();
    }
  };

  const beginImport = (files: File[], targetFolder: string) => {
    const incoming = createAssetImportCandidates(files, targetFolder);
    if (incoming.length === 0) return;
    const assets = { ...project.assets };
    const folders = new Set(project.assetFolders ?? []);
    const sources = new Map(Object.keys(project.assets).map((path) => [path, `resources/${path}`]));
    const conflicts: AssetConflict[] = [];

    for (const candidate of incoming) {
      addParentFolders(candidate.asset.path, folders);
      const existing = assets[candidate.asset.path];
      if (existing) {
        conflicts.push({
          path: candidate.asset.path,
          existing,
          existingSource: sources.get(candidate.asset.path) ?? `resources/${candidate.asset.path}`,
          incoming: candidate,
        });
      } else {
        assets[candidate.asset.path] = candidate.asset;
        sources.set(candidate.asset.path, candidate.sourcePath);
      }
    }

    if (conflicts.length === 0) {
      void persistImport(assets, [...folders], incoming);
      return;
    }
    setPendingImport({ assets, folders: [...folders], conflicts, index: 0, incoming });
  };

  const resolveImportConflict = (useIncoming: boolean) => {
    if (!pendingImport) return;
    const conflict = pendingImport.conflicts[pendingImport.index];
    const assets = { ...pendingImport.assets };
    if (useIncoming) assets[conflict.path] = conflict.incoming.asset;
    else URL.revokeObjectURL(conflict.incoming.asset.url);
    const nextIndex = pendingImport.index + 1;
    if (nextIndex < pendingImport.conflicts.length) {
      setPendingImport({ ...pendingImport, assets, index: nextIndex });
    } else {
      setPendingImport(null);
      void persistImport(assets, pendingImport.folders, pendingImport.incoming);
    }
  };

  const cancelImport = () => {
    if (!pendingImport) return;
    for (const candidate of pendingImport.incoming) URL.revokeObjectURL(candidate.asset.url);
    setPendingImport(null);
  };

  const createFolder = async (parentFolder: string) => {
    const rawName = await dialogManager.prompt({
      title: "新建文件夹",
      message: `在 resources/${parentFolder ? `${parentFolder}/` : ""} 下新建文件夹`,
      defaultValue: "新建文件夹",
      validate: (val) => {
        const trimmed = val.trim();
        if (!trimmed) return "文件夹名称不能为空";
        if (trimmed === "." || trimmed === ".." || /[\\/:*?"<>|]/.test(trimmed)) {
          return "文件夹名称不能包含 \\ / : * ? \" < > |，也不能为 . 或 ..";
        }
        if (!parentFolder && isReservedAssetFolder(trimmed)) {
          return "不能使用系统保留文件夹名称 (_preview 或 _widget)";
        }
        const path = parentFolder ? `${parentFolder}/${trimmed}` : trimmed;
        if ((project.assetFolders ?? []).includes(path) || project.assets[path]) {
          return `resources/${path} 已存在`;
        }
        return null;
      },
    });
    const name = rawName?.trim();
    if (!name) return;
    const path = parentFolder ? `${parentFolder}/${name}` : name;
    startResourceMutation();
    try {
      if (projectDirectory) {
        await createResourceFolder(projectDirectory, path);
      }
    } catch (error) {
      void dialogManager.alert({
        title: "新建文件夹失败",
        message: error instanceof Error ? error.message : "新建文件夹失败",
        type: "error",
      });
      finishResourceMutation();
      return;
    }
    if (!addAssetFolder(path)) {
      void dialogManager.alert({
        title: "创建失败",
        message: `resources/${path} 已存在`,
        type: "warning",
      });
      finishResourceMutation();
      return;
    }
    setActiveFolder(path);
    setCollapsedFolders((current) => {
      const next = new Set(current);
      next.delete(parentFolder);
      next.add(path);
      return next;
    });
    finishResourceMutation();
  };

  const renameFolder = async (path: string) => {
    if (isReservedAssetFolder(path)) {
      void dialogManager.alert({ title: "禁止重命名", message: `resources/${path} 为系统保留文件夹，不可修改名称`, type: "warning" });
      return;
    }
    const parts = path.split("/");
    const currentName = parts.at(-1) ?? "";
    const rawName = await dialogManager.prompt({
      title: "重命名文件夹",
      message: `重命名 resources/${path}`,
      defaultValue: currentName,
      validate: (val) => {
        const trimmed = val.trim();
        if (!trimmed) return "文件夹名称不能为空";
        if (trimmed === "." || trimmed === ".." || /[\\/:*?"<>|]/.test(trimmed)) {
          return "文件夹名称不能包含 \\ / : * ? \" < > |，也不能为 . 或 ..";
        }
        if (parts.length === 1 && isReservedAssetFolder(trimmed)) {
          return "不能使用系统保留文件夹名称 (_preview 或 _widget)";
        }
        return null;
      },
    });
    const newName = rawName?.trim();
    if (!newName || newName === currentName) return;
    const targetPath = [...parts.slice(0, -1), newName].join("/");
    startResourceMutation();
    try {
      if (projectDirectory) {
        const result = await renameResourceFolder(projectDirectory, path, newName);
        if (result === "conflict") {
          void dialogManager.alert({
            title: "重命名失败",
            message: `resources/${targetPath} 已存在，未重命名文件夹`,
            type: "warning",
          });
          return;
        }
        if (result === "missing") {
          void dialogManager.alert({
            title: "重命名失败",
            message: `resources/${path} 不存在，请等待资源管理同步后重试`,
            type: "warning",
          });
          return;
        }
        if (result !== "moved") return;
      } else {
        if ((project.assetFolders ?? []).includes(targetPath)) {
          void dialogManager.alert({
            title: "重命名失败",
            message: `resources/${targetPath} 已存在，未重命名文件夹`,
            type: "warning",
          });
          return;
        }
      }
      const stateResult = renameAssetFolder(path, newName);
      if (stateResult !== "moved") {
        void dialogManager.alert({
          title: "状态同步提示",
          message: "文件夹已在磁盘重命名，但编辑器状态未能同步，请等待资源管理自动刷新",
          type: "warning",
        });
        return;
      }
      setActiveFolder((current) => current === path || current.startsWith(`${path}/`)
        ? `${targetPath}${current.slice(path.length)}`
        : current
      );
      setCollapsedFolders((current) => new Set([...current].map((folder) =>
        folder === path || folder.startsWith(`${path}/`)
          ? `${targetPath}${folder.slice(path.length)}`
          : folder
      )));
      setSelectedAssetPaths((current) => new Set([...current].map((assetPath) =>
        assetPath.startsWith(`${path}/`) ? `${targetPath}${assetPath.slice(path.length)}` : assetPath
      )));
      if (selectionAnchorRef.current.startsWith(`${path}/`)) {
        selectionAnchorRef.current = `${targetPath}${selectionAnchorRef.current.slice(path.length)}`;
      }
    } catch (error) {
      void dialogManager.alert({
        title: "重命名文件夹失败",
        message: error instanceof Error ? error.message : "重命名文件夹失败",
        type: "error",
      });
    } finally {
      finishResourceMutation();
    }
  };

  const deleteFolder = async (path: string) => {
    if (isReservedAssetFolder(path)) {
      void dialogManager.alert({ title: "禁止删除", message: `resources/${path} 为系统保留文件夹，不可删除`, type: "warning" });
      return;
    }
    const fileCount = Object.keys(project.assets).filter((assetPath) => assetPath.startsWith(`${path}/`)).length;
    const folderCount = (project.assetFolders ?? []).filter((folder) => folder === path || folder.startsWith(`${path}/`)).length;
    const ok = await dialogManager.confirm({
      title: "删除文件夹",
      message: `确定删除 resources/${path}？其中包含 ${fileCount} 个文件、${Math.max(0, folderCount - 1)} 个子文件夹。`,
      confirmText: "删除文件夹",
      danger: true,
    });
    if (!ok) return;
    startResourceMutation();
    try {
      if (projectDirectory) {
        await deleteResourceFolder(projectDirectory, path);
      }
    } catch (error) {
      void dialogManager.alert({
        title: "删除文件夹失败",
        message: error instanceof Error ? error.message : "删除文件夹失败",
        type: "error",
      });
      finishResourceMutation();
      return;
    }
    if (!removeAssetFolder(path)) {
      finishResourceMutation();
      return;
    }
    setSelectedAssetPaths((current) => new Set([...current].filter((assetPath) => !assetPath.startsWith(`${path}/`))));
    if (activeFolder === path || activeFolder.startsWith(`${path}/`)) {
      setActiveFolder(path.split("/").slice(0, -1).join("/"));
    }
    setCollapsedFolders((current) => new Set([...current].filter((folder) =>
      folder !== path && !folder.startsWith(`${path}/`)
    )));
    finishResourceMutation();
  };

  const renameFile = async (path: string) => {
    const parts = path.split("/");
    const currentName = parts.at(-1) ?? "";
    const rawName = await dialogManager.prompt({
      title: "重命名文件",
      message: `重命名 resources/${path}`,
      defaultValue: currentName,
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "文件名不能为空";
        if (trimmed === "." || trimmed === ".." || /[\\/:*?\"<>|]/.test(trimmed)) {
          return "文件名不能包含 \\ / : * ? \" < > |，也不能为 . 或 ..";
        }
        return null;
      },
    });
    const newName = rawName?.trim();
    if (!newName || newName === currentName) return;
    const targetPath = [...parts.slice(0, -1), newName].join("/");
    startResourceMutation();
    try {
      if (projectDirectory) {
        const result = await renameResourceFile(projectDirectory, path, newName);
        if (result === "conflict") {
          void dialogManager.alert({ title: "重命名失败", message: `resources/${targetPath} 已存在`, type: "warning" });
          return;
        }
        if (result === "missing") {
          void dialogManager.alert({ title: "重命名失败", message: `resources/${path} 不存在，请等待资源管理同步后重试`, type: "warning" });
          return;
        }
        if (result !== "moved") return;
      } else {
        if (project.assets[targetPath]) {
          void dialogManager.alert({ title: "重命名失败", message: `resources/${targetPath} 已存在`, type: "warning" });
          return;
        }
      }
      if (renameAsset(path, newName) !== "moved") {
        void dialogManager.alert({ title: "状态同步提示", message: "文件已在磁盘重命名，但编辑器状态未能同步，请等待资源管理自动刷新", type: "warning" });
        return;
      }
      setSelectedAssetPaths((current) => new Set([...current].map((entry) => entry === path ? targetPath : entry)));
      if (selectionAnchorRef.current === path) selectionAnchorRef.current = targetPath;
    } catch (error) {
      void dialogManager.alert({ title: "重命名文件失败", message: error instanceof Error ? error.message : "重命名文件失败", type: "error" });
    } finally {
      finishResourceMutation();
    }
  };

  const deleteFile = async (path: string) => {
    const ok = await dialogManager.confirm({
      title: "永久删除文件",
      message: `确定永久删除 resources/${path}？此操作无法恢复。引用该文件的资源会变为无效。`,
      confirmText: "永久删除",
      danger: true,
    });
    if (!ok) return;
    startResourceMutation();
    try {
      if (projectDirectory) {
        await deleteResourceFile(projectDirectory, path);
      }
      if (!removeAsset(path)) {
        void dialogManager.alert({ title: "状态同步提示", message: "文件已从磁盘删除，但编辑器状态未能同步，请等待资源管理自动刷新", type: "warning" });
        return;
      }
      setSelectedAssetPaths((current) => new Set([...current].filter((entry) => entry !== path)));
      if (selectionAnchorRef.current === path) selectionAnchorRef.current = "";
    } catch (error) {
      void dialogManager.alert({ title: "永久删除文件失败", message: error instanceof Error ? error.message : "永久删除文件失败", type: "error" });
    } finally {
      finishResourceMutation();
    }
  };

  const selectFile = (path: string, event: MouseEvent<HTMLDivElement>) => {
    setSelectedAssetPaths((current) => {
      if (event.shiftKey && selectionAnchorRef.current) {
        const anchorIndex = visibleAssetPaths.indexOf(selectionAnchorRef.current);
        const pathIndex = visibleAssetPaths.indexOf(path);
        if (anchorIndex >= 0 && pathIndex >= 0) {
          const start = Math.min(anchorIndex, pathIndex);
          const end = Math.max(anchorIndex, pathIndex);
          const next = event.ctrlKey ? new Set(current) : new Set<string>();
          for (const selectedPath of visibleAssetPaths.slice(start, end + 1)) next.add(selectedPath);
          return next;
        }
      }
      selectionAnchorRef.current = path;
      if (event.ctrlKey) {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      }
      return new Set([path]);
    });
  };

  const startFileDrag = (path: string, event: DragEvent<HTMLDivElement>) => {
    const paths = selectedAssetPaths.has(path)
      ? visibleAssetPaths.filter((assetPath) => selectedAssetPaths.has(assetPath))
      : [path];
    if (!selectedAssetPaths.has(path)) {
      setSelectedAssetPaths(new Set([path]));
      selectionAnchorRef.current = path;
    }
    event.dataTransfer.effectAllowed = "move";
    draggedAssetPathsRef.current = paths;
    event.dataTransfer.setData("application/x-watchface-assets", JSON.stringify(paths));
    event.dataTransfer.setData("text/plain", paths.map((assetPath) => `resources/${assetPath}`).join("\n"));
  };

  const dropFiles = async (sourcePaths: string[], targetFolder: string) => {
    const draggedPaths = sourcePaths.length > 0 ? sourcePaths : draggedAssetPathsRef.current;
    const paths = [...new Set(draggedPaths)].filter((path) => project.assets[path]);
    draggedAssetPathsRef.current = [];
    if (paths.length === 0) return;
    startResourceMutation();
    setFileOperation({ kind: "move", progress: initialProgress(paths, project.assets) });
    try {
      if (projectDirectory) {
        const result = await moveResourceFiles(projectDirectory, paths, targetFolder, (progress) => {
          setFileOperation({ kind: "move", progress });
        });
        if (result.status === "conflict") {
          void dialogManager.alert({
            title: "移动文件冲突",
            message: `resources/${result.path} 已存在，未移动文件`,
            type: "warning",
          });
          return;
        }
        if (result.status === "missing") {
          void dialogManager.alert({
            title: "移动文件失败",
            message: `resources/${result.path} 不存在，请重新打开项目`,
            type: "warning",
          });
          return;
        }
        if (result.status !== "moved") return;
      } else {
        for (const p of paths) {
          const fileName = p.split("/").at(-1) ?? "";
          const targetPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
          if (p !== targetPath && project.assets[targetPath]) {
            void dialogManager.alert({
              title: "移动文件冲突",
              message: `resources/${targetPath} 已存在，未移动文件`,
              type: "warning",
            });
            return;
          }
        }
      }
      const stateResult = moveAssets(paths, targetFolder);
      if (stateResult !== "moved") {
        void dialogManager.alert({
          title: "状态同步提示",
          message: "文件已在磁盘移动，但编辑器状态未能同步，请重新打开项目",
          type: "warning",
        });
        return;
      }
      const movedPaths = paths.map((sourcePath) => {
        const fileName = sourcePath.split("/").at(-1) ?? "";
        return targetFolder ? `${targetFolder}/${fileName}` : fileName;
      });
      setSelectedAssetPaths(new Set(movedPaths));
      selectionAnchorRef.current = movedPaths.at(-1) ?? "";
    } catch (error) {
      void dialogManager.alert({
        title: "移动文件失败",
        message: error instanceof Error ? error.message : "移动文件失败",
        type: "error",
      });
    } finally {
      setFileOperation(null);
      finishResourceMutation();
    }
  };

  const dropFolder = async (sourcePath: string, targetFolder: string) => {
    if (isReservedAssetFolder(sourcePath)) {
      void dialogManager.alert({
        title: "无效操作",
        message: `resources/${sourcePath} 为系统保留文件夹，不可移动`,
        type: "warning",
      });
      return;
    }
    startResourceMutation();
    try {
      if (projectDirectory) {
        const result = await moveResourceFolder(projectDirectory, sourcePath, targetFolder);
        if (result === "conflict") {
          const folderName = sourcePath.split("/").at(-1);
          void dialogManager.alert({
            title: "移动文件夹冲突",
            message: `resources/${targetFolder ? `${targetFolder}/` : ""}${folderName} 已存在，未移动文件夹`,
            type: "warning",
          });
          return;
        }
        if (result === "invalid") {
          void dialogManager.alert({
            title: "无效操作",
            message: "不能把文件夹移动到自身或其子目录中",
            type: "warning",
          });
          return;
        }
        if (result === "missing") {
          void dialogManager.alert({
            title: "移动文件夹失败",
            message: `resources/${sourcePath} 不存在，请重新打开项目`,
            type: "warning",
          });
          return;
        }
        if (result !== "moved") return;
      } else {
        const folderName = sourcePath.split("/").at(-1) ?? "";
        const targetPath = targetFolder ? `${targetFolder}/${folderName}` : folderName;
        if (targetFolder === sourcePath || targetFolder.startsWith(`${sourcePath}/`)) {
          void dialogManager.alert({
            title: "无效操作",
            message: "不能把文件夹移动到自身或其子目录中",
            type: "warning",
          });
          return;
        }
        if ((project.assetFolders ?? []).includes(targetPath)) {
          void dialogManager.alert({
            title: "移动文件夹冲突",
            message: `resources/${targetPath} 已存在，未移动文件夹`,
            type: "warning",
          });
          return;
        }
      }
      const stateResult = moveAssetFolder(sourcePath, targetFolder);
      if (stateResult !== "moved") {
        void dialogManager.alert({
          title: "状态同步提示",
          message: "文件夹已在磁盘移动，但编辑器状态未能同步，请重新打开项目",
          type: "warning",
        });
        return;
      }
      const folderName = sourcePath.split("/").at(-1) ?? "";
      const targetPath = targetFolder ? `${targetFolder}/${folderName}` : folderName;
      if (activeFolder === sourcePath || activeFolder.startsWith(`${sourcePath}/`)) {
        setActiveFolder(`${targetPath}${activeFolder.slice(sourcePath.length)}`);
      }
      setCollapsedFolders((current) => new Set([...current].map((path) =>
        path === sourcePath || path.startsWith(`${sourcePath}/`)
          ? `${targetPath}${path.slice(sourcePath.length)}`
          : path
      )));
      setSelectedAssetPaths((current) => new Set([...current].map((path) =>
        path.startsWith(`${sourcePath}/`) ? `${targetPath}${path.slice(sourcePath.length)}` : path
      )));
      if (selectionAnchorRef.current.startsWith(`${sourcePath}/`)) {
        selectionAnchorRef.current = `${targetPath}${selectionAnchorRef.current.slice(sourcePath.length)}`;
      }
    } catch (error) {
      void dialogManager.alert({
        title: "移动文件夹失败",
        message: error instanceof Error ? error.message : "移动文件夹失败",
        type: "error",
      });
    } finally {
      finishResourceMutation();
    }
  };

  return (
    <aside className="sidebar panel-surface">
      <nav className="sidebar-tabs" aria-label="编辑器侧栏">
        <button className={tab === "layouts" ? "is-active" : ""} onClick={() => setTab("layouts")}><Layers3 size={15} />布局</button>
        <button className={tab === "resources" ? "is-active" : ""} onClick={() => setTab("resources")}><Box size={15} />资源</button>
        <button className={tab === "files" ? "is-active" : ""} onClick={() => setTab("files")}><Folder size={15} />文件</button>
      </nav>

      {tab === "layouts" ? (
        <div className="sidebar-content">
          <div className="layout-list">
            {[...(theme?.layouts ?? [])].reverse().map((layout, reverseIndex) => {
              const actualIndex = (theme?.layouts.length ?? 1) - reverseIndex - 1;
              const selected = selection.kind === "layout" && selection.layoutId === layout.id;
              const isTarget = dropTargetLayout?.id === layout.id && draggedLayoutId !== null && draggedLayoutId !== layout.id;
              const rowClassName = [
                "layout-row",
                selected ? "is-selected" : "",
                draggedLayoutId === layout.id ? "is-dragging" : "",
                isTarget && dropTargetLayout.position === "before" ? "drop-indicator-top" : "",
                isTarget && dropTargetLayout.position === "after" ? "drop-indicator-bottom" : "",
              ].filter(Boolean).join(" ");
              return (
                <div
                  ref={selected ? selectedLayoutRowRef : undefined}
                  className={rowClassName}
                  key={layout.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (theme) setSelection({ kind: "layout", themeId: theme.id, layoutId: layout.id });
                    setContextMenu({ x: event.clientX, y: event.clientY, layoutId: layout.id });
                  }}
                  onDragOver={(event) => {
                    if (draggedLayoutId && draggedLayoutId !== layout.id) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDropTargetLayout((current) => (current?.id === layout.id && current.position === position ? current : { id: layout.id, position }));
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropTargetLayout((current) => (current?.id === layout.id ? null : current));
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedLayoutId && draggedLayoutId !== layout.id && dropTargetLayout) {
                      const sourceIndex = (theme?.layouts ?? []).findIndex((l) => l.id === draggedLayoutId);
                      let finalIndex = actualIndex;
                      if (dropTargetLayout.position === "before") {
                        finalIndex = sourceIndex < actualIndex ? actualIndex : actualIndex + 1;
                      } else {
                        finalIndex = sourceIndex < actualIndex ? actualIndex - 1 : actualIndex;
                      }
                      reorderLayout(theme.id, draggedLayoutId, Math.max(0, Math.min((theme?.layouts.length ?? 1) - 1, finalIndex)));
                    }
                    setDraggedLayoutId(null);
                    setDropTargetLayout(null);
                  }}
                >
                  <div className="layout-row-main">
                    <button
                      className="layout-drag-handle"
                      draggable
                      onDragStart={(event) => {
                        setDraggedLayoutId(layout.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragGhost(event, `${String(actualIndex).padStart(2, "0")} · ${layout.attrs.ref || "Layout"}`, `x:${layout.attrs.x} y:${layout.attrs.y}`);
                      }}
                      onDragEnd={() => {
                        setDraggedLayoutId(null);
                        setDropTargetLayout(null);
                      }}
                      title="拖动排序"
                    ><GripVertical size={13} /></button>
                    <button
                      className="layout-main"
                      onClick={() => setSelection({ kind: "layout", themeId: theme.id, layoutId: layout.id })}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const target = project.resources.find((r) => `@${r.attrs.name}` === layout.attrs.ref);
                        if (target) navigateTo({ kind: "resource", resourceId: target.id });
                      }}
                      title="单击选中布局；双击跳转到对应资源"
                    >
                      <span className="layout-index">{String(actualIndex).padStart(2, "0")}</span>
                      <span><strong>{layout.attrs.ref}</strong><small>x {layout.attrs.x} · y {layout.attrs.y}</small></span>
                    </button>
                    <button
                      className="layout-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayout(theme.id, layout.id);
                      }}
                      title="复制布局"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {theme?.layouts.length === 0 ? (
              <div className="empty-state-card">
                <Layers3 size={28} className="empty-state-icon" />
                <div className="empty-state-title">暂无布局</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "resources" ? (
        <div className="sidebar-content resource-pane">
          <div className="resource-toolbar">
            <div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称或类型" /></div>
            <button className="add-resource-button" onClick={() => setDialogOpen(true)}><Plus size={16} />添加资源</button>
          </div>
          <div className="resource-list">
            {groupedResources.map((group) => {
              const collapsed = collapsedResourceGroups.has(group.name);
              return (
                <div className="resource-group" key={group.name}>
                  <div className="resource-group-header">
                    <button
                      className="resource-group-toggle"
                      onClick={() => setCollapsedResourceGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.name)) next.delete(group.name);
                        else next.add(group.name);
                        return next;
                      })}
                      title={collapsed ? "展开分组" : "折叠分组"}
                    >
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span>{group.name}</span>
                      <small>{group.count}</small>
                    </button>
                  </div>
                  {collapsed ? null : group.resources.map((resource) => {
                    const selected = selectedResourceId === resource.id;
                    const actualIndex = resourceIndexMap.get(resource.id) ?? 0;
                    const draggedResource = draggedResourceId ? project.resources.find((item) => item.id === draggedResourceId) : undefined;
                    const sameGroup = draggedResource !== undefined
                      && RESOURCE_DEFINITION_MAP[draggedResource.type].group === RESOURCE_DEFINITION_MAP[resource.type].group;
                    const isTarget = sameGroup && dropTargetResource?.id === resource.id && draggedResourceId !== resource.id;
                    const dropPosition = isTarget ? dropTargetResource.position : null;

                    return (
                      <ResourceRowItem
                        key={resource.id}
                        project={project}
                        resource={resource}
                        actualIndex={actualIndex}
                        selected={selected}
                        isDragging={draggedResourceId === resource.id}
                        dropPosition={dropPosition}
                        sameGroup={sameGroup}
                        thumbnailPreview={thumbnailPreview}
                        thumbnailNow={thumbnailNow}
                        onSelect={handleSelectResource}
                        onDuplicate={duplicateResource}
                        onAddLayout={addLayout}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      />
                    );
                  })}
                </div>
              );
            })}
            {filteredResources.length === 0 ? (
              <div className="empty-state-card">
                <FolderTree size={28} className="empty-state-icon" />
                <div className="empty-state-title">未找到匹配资源</div>
                <div className="empty-state-desc">请尝试调整搜索关键词或在上方新建资源</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "files" ? (
        <div
          className="sidebar-content file-manager"
          onDragOver={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const edge = 48;
            if (event.clientY < bounds.top + edge) event.currentTarget.scrollTop -= 18;
            else if (event.clientY > bounds.bottom - edge) event.currentTarget.scrollTop += 18;
          }}
        >
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { beginImport(Array.from(event.target.files ?? []), importTargetFolderRef.current); event.currentTarget.value = ""; }} />
          <div className="asset-tree">
            <AssetTreeBranch
              node={assetTree}
              depth={0}
              activeFolder={activeFolder}
              collapsed={collapsedFolders}
              onSelectFolder={(path) => {
                setActiveFolder(path);
                setSelectedAssetPaths(new Set());
                selectionAnchorRef.current = "";
              }}
              onToggleFolder={(path) => setCollapsedFolders((current) => {
                const next = new Set(current);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })}
              selectedAssetPaths={selectedAssetPaths}
              onSelectFile={selectFile}
              onStartFileDrag={startFileDrag}
              onEndFileDrag={() => { draggedAssetPathsRef.current = []; }}
              onDropFiles={dropFiles}
              onDropFolder={dropFolder}
              onImportFiles={(targetFolder) => { importTargetFolderRef.current = targetFolder; fileInputRef.current?.click(); }}
              onRenameFile={renameFile}
              onDeleteFile={deleteFile}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
            />
            {Object.keys(project.assets).length === 0 && (project.assetFolders ?? []).length === 0 ? (
              <div className="empty-state-card">
                <FolderTree size={28} className="empty-state-icon" />
                <div className="empty-state-title">resources 目录为空</div>
                <div className="empty-state-desc">点击“导入资产”将切图文件放入表盘资源库</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <AddResourceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <AssetConflictDialog
        conflict={pendingImport?.conflicts[pendingImport.index] ?? null}
        index={pendingImport?.index ?? 0}
        total={pendingImport?.conflicts.length ?? 0}
        onKeepExisting={() => resolveImportConflict(false)}
        onUseIncoming={() => resolveImportConflict(true)}
        onCancel={cancelImport}
      />
      <FileOperationProgressDialog operation={fileOperation} />

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </aside>
  );
}
