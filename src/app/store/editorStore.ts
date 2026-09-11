import { create } from "zustand";
import {
  cloneProject,
  createBlankProject,
  createId,
  DEVICE_SIZES,
  getResourceName,
  isReservedAssetFolder,
  watchfaceDisplayName,
  type Attributes,
  type DeviceType,
  type Diagnostic,
  type ResourceType,
  type WatchfaceProject,
  type WatchfaceTheme,
} from "../core/model";
import { RESOURCE_DEFINITION_MAP } from "../editor/manifestEditorSchema";
import {
  isDeviceAttributeEditable,
  isDeviceResourceEditable,
} from "../editor/deviceEditorCapabilities";
import {
  applyHistoryPatch,
  type HistoryPatch,
  type LayoutAttrPatch,
  type ResourceAttrPatch,
  type ThemeAttrPatch,
  type ChildAttrPatch,
} from "./patchHistory";

export type Selection =
  | { kind: "project" }
  | { kind: "theme"; themeId: string }
  | { kind: "layout"; themeId: string; layoutId: string }
  | { kind: "resource"; resourceId: string };

export type GridMode = "none" | "corner" | "center";

export interface EditorState {
  project: WatchfaceProject;
  selectedThemeId: string;
  selection: Selection;
  navigationBack: Selection[];
  navigationForward: Selection[];
  parseDiagnostics: Diagnostic[];
  history: WatchfaceProject[];
  future: WatchfaceProject[];
  historyPatches: HistoryPatch[];
  futurePatches: HistoryPatch[];
  contentRevision: number;
  savedRevision: number;
  savedSnapshot: string | null;
  savedSummary: SavedSnapshotSummary | null;
  zoom: number;
  gridMode: GridMode;
  showGrid: boolean;
  previewColor: string;
  previewTemperatureUnit: "celsius" | "fahrenheit";
  previewMetrics: Record<string, number | string>;
  loadProject: (project: WatchfaceProject, diagnostics?: Diagnostic[], saved?: boolean) => void;
  resetProject: (device?: DeviceType) => void;
  markSaved: () => void;
  setParseDiagnostics: (diagnostics: Diagnostic[]) => void;
  setSelection: (selection: Selection) => void;
  navigateTo: (selection: Selection) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  setSelectedTheme: (themeId: string) => void;
  setZoom: (zoom: number) => void;
  setGridMode: (mode: GridMode) => void;
  setShowGrid: (show: boolean) => void;
  setPreviewColor: (color: string) => void;
  setPreviewTemperatureUnit: (unit: "celsius" | "fahrenheit") => void;
  setPreviewMetric: (source: string, value: number | string | undefined) => void;
  setPreviewMetrics: (metrics: Record<string, number | string>) => void;
  resetPreviewMetrics: () => void;
  updateWatchface: (key: string, value: string) => void;
  updateDescription: (key: string, value: string) => void;
  updateCanvas: (width: number, height: number, radius: number) => void;
  updateDevice: (device: DeviceType) => void;
  addResource: (type: ResourceType, attrs?: Attributes) => string;
  updateResource: (resourceId: string, key: string, value: string) => void;
  removeResource: (resourceId: string) => void;
  reorderResource: (resourceId: string, targetIndex: number) => void;
  duplicateResource: (resourceId: string) => void;
  addChild: (resourceId: string, attrs: Attributes) => void;
  updateChild: (resourceId: string, childId: string, key: string, value: string) => void;
  removeChild: (resourceId: string, childId: string) => void;
  reorderChild: (resourceId: string, childId: string, targetIndex: number) => void;
  replaceAssets: (assets: WatchfaceProject["assets"]) => void;
  replaceAssetLibrary: (assets: WatchfaceProject["assets"], folders: string[]) => void;
  syncAssetLibrary: (assets: WatchfaceProject["assets"], folders: string[]) => void;
  renameAsset: (path: string, newName: string) => "moved" | "same" | "missing" | "conflict";
  removeAsset: (path: string) => boolean;
  addAssetFolder: (path: string) => boolean;
  removeAssetFolder: (path: string) => boolean;
  moveAssets: (sourcePaths: string[], targetFolder: string) => "moved" | "same" | "missing" | "conflict";
  moveAssetFolder: (sourcePath: string, targetFolder: string) => "moved" | "same" | "missing" | "conflict" | "invalid";
  renameAssetFolder: (sourcePath: string, newName: string) => "moved" | "same" | "missing" | "conflict";
  addTheme: (type?: "normal" | "AOD") => void;
  duplicateTheme: (themeId: string) => void;
  updateTheme: (themeId: string, key: string, value: string) => void;
  removeTheme: (themeId: string) => void;
  addLayout: (resourceId: string) => void;
  updateLayout: (themeId: string, layoutId: string, attrs: Partial<Attributes>) => void;
  removeLayout: (themeId: string, layoutId: string) => void;
  duplicateLayout: (themeId: string, layoutId: string) => void;
  moveLayout: (themeId: string, layoutId: string, direction: -1 | 1) => void;
  reorderLayout: (themeId: string, layoutId: string, targetIndex: number) => void;
  undo: () => void;
  redo: () => void;
  applyHistoryPatchAction: (patch: HistoryPatch, reverse?: boolean) => void;
}

function uniqueName(project: WatchfaceProject, base: string): string {
  const names = new Set(project.resources.map(getResourceName));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function replaceResourceReferences(project: WatchfaceProject, previousName: string, nextName: string): void {
  const previousRef = `@${previousName}`;
  const nextRef = `@${nextName}`;
  const replaceIn = (attrs: Attributes) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === previousRef) attrs[key] = nextRef;
    }
  };
  replaceIn(project.watchface);
  for (const resource of project.resources) {
    replaceIn(resource.attrs);
    for (const child of resource.children) replaceIn(child.attrs);
  }
  for (const theme of project.themes) {
    replaceIn(theme.attrs);
    for (const layout of theme.layouts) replaceIn(layout.attrs);
  }
}

function normalizeAttributes(attrs: Attributes | undefined): Record<string, string> {
  if (!attrs) return {};
  const normalized: Record<string, string> = {};
  const keys = Object.keys(attrs).filter((key) => attrs[key] !== undefined && attrs[key] !== "").sort();
  for (const key of keys) {
    normalized[key] = attrs[key];
  }
  return normalized;
}

function normalizeDescription(project: WatchfaceProject): Record<string, string> {
  const isRound = project.canvas.radius >= Math.min(project.canvas.width, project.canvas.height) / 2 && project.canvas.width === project.canvas.height;
  const desc = {
    ...project.description,
    name: watchfaceDisplayName(project),
    deviceType: project.device,
    size: `${project.canvas.width}x${project.canvas.height}`,
    pkgName: project.watchface.id ?? project.description.pkgName ?? "",
    shape: project.description.shape || (isRound ? "round" : "square"),
    watchOS: project.description.watchOS || "vela",
  };
  return normalizeAttributes(desc);
}

export interface SavedSnapshotSummary {
  resourceCount: number;
  childCount: number;
  themeCount: number;
  layoutCount: number;
  checksum?: number;
}

export function calculateProjectChecksum(project: WatchfaceProject): number {
  let hash = 0x811c9dc5;
  const updateStr = (str: string | undefined) => {
    if (!str) return;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };

  updateStr(project.device);
  updateStr(String(project.canvas.width));
  updateStr(String(project.canvas.height));

  for (const res of project.resources) {
    updateStr(res.id);
    updateStr(res.type);
    for (const key of Object.keys(res.attrs).sort()) {
      updateStr(key);
      updateStr(res.attrs[key]);
    }
    for (const child of res.children) {
      updateStr(child.id);
      for (const key of Object.keys(child.attrs).sort()) {
        updateStr(key);
        updateStr(child.attrs[key]);
      }
    }
  }

  for (const theme of project.themes) {
    updateStr(theme.id);
    for (const key of Object.keys(theme.attrs).sort()) {
      updateStr(key);
      updateStr(theme.attrs[key]);
    }
    for (const layout of theme.layouts) {
      updateStr(layout.id);
      for (const key of Object.keys(layout.attrs).sort()) {
        updateStr(key);
        updateStr(layout.attrs[key]);
      }
    }
  }

  return hash >>> 0;
}

export function getProjectSummary(project: WatchfaceProject): SavedSnapshotSummary {
  let childCount = 0;
  for (const res of project.resources) childCount += res.children.length;
  let layoutCount = 0;
  for (const th of project.themes) layoutCount += th.layouts.length;
  return {
    resourceCount: project.resources.length,
    childCount,
    themeCount: project.themes.length,
    layoutCount,
    checksum: calculateProjectChecksum(project),
  };
}

const snapshotCache = new WeakMap<WatchfaceProject, string>();

export function serializeProjectSnapshot(project: WatchfaceProject | null | undefined): string {
  if (!project) return "";
  const cached = snapshotCache.get(project);
  if (cached !== undefined) return cached;
  const normalized = {
    device: project.device,
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      radius: project.canvas.radius,
    },
    description: normalizeDescription(project),
    watchface: normalizeAttributes(project.watchface),
    resources: project.resources.map((resource) => ({
      id: resource.id,
      type: resource.type,
      attrs: normalizeAttributes(resource.attrs),
      children: resource.children.map((child) => ({
        id: child.id,
        attrs: normalizeAttributes(child.attrs),
      })),
    })),
    themes: project.themes.map((theme) => ({
      id: theme.id,
      attrs: normalizeAttributes(theme.attrs),
      layouts: theme.layouts.map((layout) => ({
        id: layout.id,
        attrs: normalizeAttributes(layout.attrs),
      })),
    })),
    manifestExtensions: project.manifestExtensions.map((ext) => ({
      id: ext.id,
      parent: ext.parent,
      parentId: ext.parentId,
      index: ext.index,
      xml: ext.xml,
    })),
  };
  const result = JSON.stringify(normalized);
  snapshotCache.set(project, result);
  return result;
}

function commit(
  state: EditorState,
  mutate: (project: WatchfaceProject) => void,
): Pick<EditorState, "project" | "history" | "future" | "contentRevision" | "savedRevision"> {
  const next = cloneProject(state.project);
  mutate(next);
  const nextRevision = state.contentRevision + 1;
  const isMatchingSaved = (() => {
    if (state.savedSnapshot === null) return false;
    if (state.savedSummary) {
      if (next.resources.length !== state.savedSummary.resourceCount) return false;
      let childCount = 0;
      for (const res of next.resources) childCount += res.children.length;
      if (childCount !== state.savedSummary.childCount) return false;
      if (next.themes.length !== state.savedSummary.themeCount) return false;
      let layoutCount = 0;
      for (const th of next.themes) layoutCount += th.layouts.length;
      if (layoutCount !== state.savedSummary.layoutCount) return false;
      if (state.savedSummary.checksum !== undefined && calculateProjectChecksum(next) !== state.savedSummary.checksum) {
        return false;
      }
    }
    return serializeProjectSnapshot(next) === state.savedSnapshot;
  })();
  return {
    project: next,
    history: [...state.history.slice(-49), state.project],
    future: [],
    contentRevision: nextRevision,
    savedRevision: isMatchingSaved ? nextRevision : state.savedRevision,
  };
}

function isSameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "project":
      return true;
    case "theme":
      return a.themeId === (b as typeof a).themeId;
    case "layout":
      return a.themeId === (b as typeof a).themeId && a.layoutId === (b as typeof a).layoutId;
    case "resource":
      return a.resourceId === (b as typeof a).resourceId;
  }
}

function selectionState(state: EditorState, selection: Selection): Partial<EditorState> {
  if (isSameSelection(state.selection, selection)) return {};
  return {
    selection,
    selectedThemeId: selection.kind === "theme" || selection.kind === "layout" ? selection.themeId : state.selectedThemeId,
    navigationBack: [...state.navigationBack.slice(-29), state.selection],
    navigationForward: [],
  };
}

const initialProject = createBlankProject();

export const useEditorStore = create<EditorState>((set, get) => ({
  project: initialProject,
  selectedThemeId: initialProject.themes[0].id,
  selection: { kind: "project" },
  navigationBack: [],
  navigationForward: [],
  parseDiagnostics: [],
  history: [],
  future: [],
  historyPatches: [],
  futurePatches: [],
  contentRevision: 1,
  savedRevision: 0,
  savedSnapshot: null,
  savedSummary: null,
  zoom: 1,
  gridMode: "corner",
  showGrid: true,
  previewColor: "",
  previewTemperatureUnit: "celsius",
  previewMetrics: {},

  loadProject: (project, diagnostics = [], saved = true) =>
    set((state) => {
      const nextRevision = state.contentRevision + 1;
      const snapshot = saved ? serializeProjectSnapshot(project) : null;
      return {
        project,
        selectedThemeId: project.themes[0]?.id ?? "",
        selection: { kind: "project" },
        navigationBack: [],
        navigationForward: [],
        parseDiagnostics: diagnostics,
        history: [],
        future: [],
        historyPatches: [],
        futurePatches: [],
        previewColor: "",
        previewMetrics: {},
        contentRevision: nextRevision,
        savedRevision: saved ? nextRevision : state.savedRevision,
        savedSnapshot: snapshot,
        savedSummary: saved ? getProjectSummary(project) : null,
      };
    }),

  resetProject: (device = "O66") => {
    const project = createBlankProject(device);
    set({
      project,
      selectedThemeId: project.themes[0].id,
      selection: { kind: "project" },
      navigationBack: [],
      navigationForward: [],
      parseDiagnostics: [],
      history: [],
      future: [],
      historyPatches: [],
      futurePatches: [],
      previewColor: "",
      previewMetrics: {},
      contentRevision: 1,
      savedRevision: 0,
      savedSnapshot: null,
      savedSummary: null,
    });
  },

  markSaved: () => set((state) => ({
    savedRevision: state.contentRevision,
    savedSnapshot: serializeProjectSnapshot(state.project),
    savedSummary: getProjectSummary(state.project),
  })),

  setParseDiagnostics: (parseDiagnostics) => set({ parseDiagnostics }),
  setSelection: (selection) => set((state) => selectionState(state, selection)),
  navigateTo: (selection) => set((state) => selectionState(state, selection)),
  navigateBack: () => set((state) => {
    const previous = state.navigationBack.at(-1);
    if (!previous) return {};
    return {
      selection: previous,
      selectedThemeId: previous.kind === "theme" || previous.kind === "layout" ? previous.themeId : state.selectedThemeId,
      navigationBack: state.navigationBack.slice(0, -1),
      navigationForward: [state.selection, ...state.navigationForward].slice(0, 30),
    };
  }),
  navigateForward: () => set((state) => {
    const next = state.navigationForward[0];
    if (!next) return {};
    return {
      selection: next,
      selectedThemeId: next.kind === "theme" || next.kind === "layout" ? next.themeId : state.selectedThemeId,
      navigationBack: [...state.navigationBack.slice(-29), state.selection],
      navigationForward: state.navigationForward.slice(1),
    };
  }),
  setSelectedTheme: (selectedThemeId) => set((state) => selectionState(state, { kind: "theme", themeId: selectedThemeId })),
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.4, zoom)) }),
  setGridMode: (gridMode) => set({ gridMode, showGrid: gridMode !== "none" }),
  setShowGrid: (showGrid) => set((state) => ({
    showGrid,
    gridMode: showGrid ? (state.gridMode === "none" ? "corner" : state.gridMode) : "none",
  })),
  setPreviewColor: (previewColor) => set({ previewColor }),
  setPreviewTemperatureUnit: (previewTemperatureUnit) => set({ previewTemperatureUnit }),
  setPreviewMetric: (source, value) => set((state) => {
    const previewMetrics = { ...state.previewMetrics };
    if (value === undefined || value === "") delete previewMetrics[source];
    else previewMetrics[source] = value;
    return { previewMetrics };
  }),
  setPreviewMetrics: (previewMetrics) => set({ previewMetrics }),
  resetPreviewMetrics: () => set({ previewMetrics: {} }),

  updateWatchface: (key, value) => set((state) => commit(state, (project) => {
    if (!isDeviceAttributeEditable(project.device, "Watchface", key)) return;
    if (value === "") delete project.watchface[key];
    else project.watchface[key] = value;
    if (key === "name") project.description.name = watchfaceDisplayName(project);
    if (key === "id") project.description.pkgName = value;
  })),

  updateDescription: (key, value) => set((state) => commit(state, (project) => {
    if (value === "") delete project.description[key];
    else project.description[key] = value;
  })),

  updateCanvas: (width, height, radius) => set((state) => commit(state, (project) => {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    project.canvas = {
      width: nextWidth,
      height: nextHeight,
      radius: Math.min(Math.max(0, radius), Math.min(nextWidth, nextHeight) / 2),
    };
    project.description.size = `${nextWidth}x${nextHeight}`;
  })),

  updateDevice: (device) => set((state) => commit(state, (project) => {
    project.device = device;
    project.canvas = { ...DEVICE_SIZES[device] };
    project.description.deviceType = device;
    project.description.size = `${project.canvas.width}x${project.canvas.height}`;
    const isRound = project.canvas.radius >= Math.min(project.canvas.width, project.canvas.height) / 2 && project.canvas.width === project.canvas.height;
    project.description.shape = isRound ? "round" : "square";
    project.description.watchOS = "vela";
  })),

  addResource: (type, attrs = {}) => {
    if (!isDeviceResourceEditable(get().project.device, type)) {
      throw new Error(`当前设备不支持资源类型 ${type}`);
    }
    const id = createId("resource");
    set((state) => commit(state, (project) => {
      const defaults = { ...RESOURCE_DEFINITION_MAP[type].defaults, ...attrs };
      defaults.name = uniqueName(project, defaults.name || type);
      project.resources.push({ id, type, attrs: defaults, children: [] });
    }));
    set({ selection: { kind: "resource", resourceId: id } });
    return id;
  },

  updateResource: (resourceId, key, value) => set((state) => {
    const resource = state.project.resources.find((entry) => entry.id === resourceId);
    if (!resource) return state;
    if (!isDeviceResourceEditable(state.project.device, resource.type)) return state;
    if (!isDeviceAttributeEditable(state.project.device, resource.type, key)) return state;

    if (key === "name") {
      return commit(state, (project) => {
        const res = project.resources.find((entry) => entry.id === resourceId);
        if (!res) return;
        const previousName = res.attrs.name;
        if (value === "") delete res.attrs[key];
        else res.attrs[key] = value;
        if (previousName && value && previousName !== value) replaceResourceReferences(project, previousName, value);
      });
    }

    const currentVal = resource.attrs[key] ?? "";
    if (currentVal === value) return state;

    const prevAttrs = { ...resource.attrs };
    const nextAttrs = { ...resource.attrs };
    if (value === "") delete nextAttrs[key];
    else nextAttrs[key] = value;

    const patch: ResourceAttrPatch = {
      kind: "resource_attrs",
      resourceId,
      prevAttrs,
      nextAttrs,
    };

    const nextResources = state.project.resources.map((r) =>
      r.id === resourceId ? { ...r, attrs: nextAttrs } : r
    );
    const nextProject = { ...state.project, resources: nextResources };

    return {
      project: nextProject,
      history: [state.project, ...state.history].slice(0, 200),
      historyPatches: [patch, ...state.historyPatches].slice(0, 200),
      future: [],
      futurePatches: [],
      contentRevision: state.contentRevision + 1,
    };
  }),

  removeResource: (resourceId) => set((state) => {
    const update = commit(state, (project) => {
      project.resources = project.resources.filter((resource) => resource.id !== resourceId);
    });
    return { ...update, selection: { kind: "project" } as Selection };
  }),

  reorderResource: (resourceId, targetIndex) => set((state) => commit(state, (project) => {
    const sourceIndex = project.resources.findIndex((resource) => resource.id === resourceId);
    if (sourceIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(project.resources.length - 1, targetIndex));
    if (sourceIndex === nextIndex) return;
    const [resource] = project.resources.splice(sourceIndex, 1);
    project.resources.splice(nextIndex, 0, resource);
  })),

  duplicateResource: (resourceId) => set((state) => {
    const newId = createId("resource");
    const update = commit(state, (project) => {
      const index = project.resources.findIndex((resource) => resource.id === resourceId);
      if (index < 0) return;
      const source = project.resources[index];
      project.resources.splice(index + 1, 0, {
        id: newId,
        type: source.type,
        attrs: {
          ...source.attrs,
          name: uniqueName(project, getResourceName(source)),
        },
        children: source.children.map((child) => ({ id: createId("child"), attrs: { ...child.attrs } })),
      });
    });
    return { ...update, selection: { kind: "resource", resourceId: newId } as Selection };
  }),

  addChild: (resourceId, attrs) => set((state) => commit(state, (project) => {
    const resource = project.resources.find((entry) => entry.id === resourceId);
    if (!resource || !isDeviceResourceEditable(project.device, resource.type)) return;
    const childTag = RESOURCE_DEFINITION_MAP[resource.type].child?.tag;
    if (!childTag) return;
    const target = `${resource.type}/${childTag}`;
    const allowedAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([key]) => isDeviceAttributeEditable(project.device, target, key)),
    );
    resource.children.push({ id: createId("child"), attrs: allowedAttrs });
  })),

  updateChild: (resourceId, childId, key, value) => set((state) => {
    const resource = state.project.resources.find((entry) => entry.id === resourceId);
    if (!resource || !isDeviceResourceEditable(state.project.device, resource.type)) return state;
    const childTag = RESOURCE_DEFINITION_MAP[resource.type].child?.tag;
    if (!childTag || !isDeviceAttributeEditable(state.project.device, `${resource.type}/${childTag}`, key)) return state;
    const child = resource.children.find((entry) => entry.id === childId);
    if (!child) return state;

    const currentVal = child.attrs[key] ?? "";
    if (currentVal === value) return state;

    const prevAttrs = { ...child.attrs };
    const nextAttrs = { ...child.attrs };
    if (value === "") delete nextAttrs[key];
    else nextAttrs[key] = value;

    const patch: ChildAttrPatch = {
      kind: "child_attrs",
      resourceId,
      childId,
      prevAttrs,
      nextAttrs,
    };

    const nextResources = state.project.resources.map((r) => {
      if (r.id !== resourceId) return r;
      const nextChildren = r.children.map((c) =>
        c.id === childId ? { ...c, attrs: nextAttrs } : c
      );
      return { ...r, children: nextChildren };
    });
    const nextProject = { ...state.project, resources: nextResources };

    return {
      project: nextProject,
      history: [state.project, ...state.history].slice(0, 200),
      historyPatches: [patch, ...state.historyPatches].slice(0, 200),
      future: [],
      futurePatches: [],
      contentRevision: state.contentRevision + 1,
    };
  }),

  removeChild: (resourceId, childId) => set((state) => commit(state, (project) => {
    const resource = project.resources.find((entry) => entry.id === resourceId);
    if (resource) resource.children = resource.children.filter((child) => child.id !== childId);
  })),

  reorderChild: (resourceId, childId, targetIndex) => set((state) => commit(state, (project) => {
    const resource = project.resources.find((entry) => entry.id === resourceId);
    if (!resource) return;
    const sourceIndex = resource.children.findIndex((child) => child.id === childId);
    if (sourceIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(resource.children.length - 1, targetIndex));
    if (sourceIndex === nextIndex) return;
    const [child] = resource.children.splice(sourceIndex, 1);
    resource.children.splice(nextIndex, 0, child);
  })),

  replaceAssets: (assets) => set((state) => commit(state, (project) => {
    project.assets = assets;
  })),

  replaceAssetLibrary: (assets, folders) => set((state) => {
    const assetFolders = [...new Set(folders)].sort();
    const synchronize = (project: WatchfaceProject): WatchfaceProject => ({
      ...project,
      assets,
      assetFolders,
    });
    return {
      project: synchronize(state.project),
      history: state.history.map(synchronize),
      future: state.future.map(synchronize),
    };
  }),

  syncAssetLibrary: (assets, folders) => set((state) => {
    const assetFolders = [...new Set(folders)].sort();
    const synchronize = (project: WatchfaceProject): WatchfaceProject => ({
      ...project,
      assets,
      assetFolders,
    });
    return {
      project: synchronize(state.project),
      history: state.history.map(synchronize),
      future: state.future.map(synchronize),
    };
  }),

  renameAsset: (path, newName) => {
    const sourcePath = path.replaceAll("\\", "/");
    const parts = sourcePath.split("/");
    const currentName = parts.pop() ?? "";
    if (currentName === newName) return "same";
    const targetPath = [...parts, newName].join("/");
    let result: "moved" | "same" | "missing" | "conflict" = "missing";
    set((state) => {
      if (!state.project.assets[sourcePath]) return state;
      if (state.project.assets[targetPath]) {
        result = "conflict";
        return state;
      }
      result = "moved";
      return commit(state, (project) => {
        const asset = project.assets[sourcePath];
        delete project.assets[sourcePath];
        project.assets[targetPath] = { ...asset, path: targetPath };
        const rewrite = (attrs: Attributes) => {
          for (const [key, value] of Object.entries(attrs)) {
            if (value === sourcePath) attrs[key] = targetPath;
          }
        };
        rewrite(project.watchface);
        for (const resource of project.resources) {
          rewrite(resource.attrs);
          for (const child of resource.children) rewrite(child.attrs);
        }
        for (const theme of project.themes) {
          rewrite(theme.attrs);
          for (const layout of theme.layouts) rewrite(layout.attrs);
        }
      });
    });
    return result;
  },

  removeAsset: (path) => {
    const normalized = path.replaceAll("\\", "/");
    let removed = false;
    set((state) => {
      if (!state.project.assets[normalized]) return state;
      removed = true;
      return commit(state, (project) => {
        delete project.assets[normalized];
      });
    });
    return removed;
  },

  addAssetFolder: (path) => {
    const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    let added = false;
    set((state) => {
      if (!normalized || state.project.assetFolders.includes(normalized) || state.project.assets[normalized]) {
        return state;
      }
      added = true;
      const addFolder = (project: WatchfaceProject): WatchfaceProject => {
        const assetFolders = [...project.assetFolders];
        const parts = normalized.split("/");
        for (let index = 1; index <= parts.length; index += 1) {
          const folder = parts.slice(0, index).join("/");
          if (!assetFolders.includes(folder)) assetFolders.push(folder);
        }
        return { ...project, assetFolders: assetFolders.sort() };
      };
      return {
        project: addFolder(state.project),
        history: state.history.map(addFolder),
        future: state.future.map(addFolder),
      };
    });
    return added;
  },

  removeAssetFolder: (path) => {
    const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!normalized || isReservedAssetFolder(normalized)) return false;
    let removed = false;
    set((state) => {
      const folderExists = state.project.assetFolders.includes(normalized)
        || Object.keys(state.project.assets).some((assetPath) => assetPath.startsWith(`${normalized}/`));
      if (!folderExists) return state;
      removed = true;
      const removeFolder = (project: WatchfaceProject): WatchfaceProject => {
        const assets = Object.fromEntries(Object.entries(project.assets).filter(([assetPath]) =>
          !assetPath.startsWith(`${normalized}/`)
        ));
        const assetFolders = project.assetFolders.filter((folder) =>
          folder !== normalized && !folder.startsWith(`${normalized}/`)
        );
        return { ...project, assets, assetFolders };
      };
      return {
        project: removeFolder(state.project),
        history: state.history.map(removeFolder),
        future: state.future.map(removeFolder),
      };
    });
    return removed;
  },

  moveAssets: (sourcePaths, targetFolder) => {
    const normalizedFolder = targetFolder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const uniquePaths = [...new Set(sourcePaths)];
    let result: "moved" | "same" | "missing" | "conflict" = "same";
    set((state) => {
      if (uniquePaths.some((path) => !state.project.assets[path])) {
        result = "missing";
        return state;
      }
      const changes = new Map<string, string>();
      for (const sourcePath of uniquePaths) {
        const fileName = sourcePath.split("/").at(-1) ?? "";
        const targetPath = normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
        if (sourcePath !== targetPath) changes.set(sourcePath, targetPath);
      }
      if (changes.size === 0) return state;
      const targets = [...changes.values()];
      if (new Set(targets).size !== targets.length || targets.some((path) => state.project.assets[path])) {
        result = "conflict";
        return state;
      }
      result = "moved";
      return commit(state, (project) => {
        const movedAssets = [...changes].map(([sourcePath, targetPath]) => ({
          sourcePath,
          targetPath,
          asset: project.assets[sourcePath],
        }));
        for (const { sourcePath } of movedAssets) delete project.assets[sourcePath];
        for (const { targetPath, asset } of movedAssets) project.assets[targetPath] = { ...asset, path: targetPath };
        if (normalizedFolder && !project.assetFolders.includes(normalizedFolder)) {
          project.assetFolders.push(normalizedFolder);
          project.assetFolders.sort();
        }
        const rewrite = (attrs: Attributes) => {
          for (const [key, value] of Object.entries(attrs)) {
            const targetPath = changes.get(value);
            if (targetPath) attrs[key] = targetPath;
          }
        };
        rewrite(project.watchface);
        for (const resource of project.resources) {
          rewrite(resource.attrs);
          for (const child of resource.children) rewrite(child.attrs);
        }
        for (const theme of project.themes) {
          rewrite(theme.attrs);
          for (const layout of theme.layouts) rewrite(layout.attrs);
        }
      });
    });
    return result;
  },

  moveAssetFolder: (sourcePath, targetFolder) => {
    const source = sourcePath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const target = targetFolder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const folderName = source.split("/").at(-1) ?? "";
    const targetPath = target ? `${target}/${folderName}` : folderName;
    if (!source || source === targetPath) return "same";
    if (isReservedAssetFolder(source) || isReservedAssetFolder(targetPath)) return "invalid";
    if (target === source || target.startsWith(`${source}/`)) return "invalid";
    let result: "moved" | "missing" | "conflict" = "missing";
    set((state) => {
      const sourceExists = state.project.assetFolders.includes(source)
        || Object.keys(state.project.assets).some((path) => path.startsWith(`${source}/`));
      if (!sourceExists) return state;
      const movingAssets = Object.keys(state.project.assets).filter((path) => path.startsWith(`${source}/`));
      const movingAssetSet = new Set(movingAssets);
      const movingFolders = state.project.assetFolders.filter((path) => path === source || path.startsWith(`${source}/`));
      const stationaryFolders = state.project.assetFolders.filter((path) => path !== source && !path.startsWith(`${source}/`));
      const newAssetPaths = movingAssets.map((path) => `${targetPath}${path.slice(source.length)}`);
      const newFolderPaths = movingFolders.map((path) => `${targetPath}${path.slice(source.length)}`);
      const fileConflict = newAssetPaths.some((path) => state.project.assets[path] && !movingAssetSet.has(path));
      const folderConflict = stationaryFolders.some((path) =>
        path === targetPath || path.startsWith(`${targetPath}/`) || newFolderPaths.includes(path)
      );
      if (state.project.assets[targetPath] || fileConflict || folderConflict) {
        result = "conflict";
        return state;
      }
      result = "moved";
      return commit(state, (project) => {
        const pathChanges = new Map<string, string>();
        for (const oldPath of movingAssets) {
          const newPath = `${targetPath}${oldPath.slice(source.length)}`;
          pathChanges.set(oldPath, newPath);
          const asset = project.assets[oldPath];
          delete project.assets[oldPath];
          project.assets[newPath] = { ...asset, path: newPath };
        }
        project.assetFolders = project.assetFolders
          .filter((path) => path !== source && !path.startsWith(`${source}/`))
          .concat(newFolderPaths);
        const targetParts = targetPath.split("/");
        for (let index = 1; index <= targetParts.length; index += 1) {
          project.assetFolders.push(targetParts.slice(0, index).join("/"));
        }
        project.assetFolders = [...new Set(project.assetFolders)].sort();
        const rewrite = (attrs: Attributes) => {
          for (const [key, value] of Object.entries(attrs)) {
            const replacement = pathChanges.get(value);
            if (replacement) attrs[key] = replacement;
          }
        };
        rewrite(project.watchface);
        for (const resource of project.resources) {
          rewrite(resource.attrs);
          for (const child of resource.children) rewrite(child.attrs);
        }
        for (const theme of project.themes) {
          rewrite(theme.attrs);
          for (const layout of theme.layouts) rewrite(layout.attrs);
        }
      });
    });
    return result;
  },

  renameAssetFolder: (sourcePath, newName) => {
    const source = sourcePath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const sourceParts = source.split("/");
    const currentName = sourceParts.pop() ?? "";
    if (!source || currentName === newName || isReservedAssetFolder(source)) return "same";
    const targetPath = [...sourceParts, newName].join("/");
    if (isReservedAssetFolder(targetPath)) return "conflict";
    let result: "moved" | "missing" | "conflict" = "missing";
    set((state) => {
      const sourceExists = state.project.assetFolders.includes(source)
        || Object.keys(state.project.assets).some((path) => path.startsWith(`${source}/`));
      if (!sourceExists) return state;
      const movingAssets = Object.keys(state.project.assets).filter((path) => path.startsWith(`${source}/`));
      const movingAssetSet = new Set(movingAssets);
      const movingFolders = state.project.assetFolders.filter((path) => path === source || path.startsWith(`${source}/`));
      const stationaryFolders = state.project.assetFolders.filter((path) => path !== source && !path.startsWith(`${source}/`));
      const newAssetPaths = movingAssets.map((path) => `${targetPath}${path.slice(source.length)}`);
      const newFolderPaths = movingFolders.map((path) => `${targetPath}${path.slice(source.length)}`);
      const fileConflict = newAssetPaths.some((path) => state.project.assets[path] && !movingAssetSet.has(path));
      const folderConflict = stationaryFolders.some((path) =>
        path === targetPath || path.startsWith(`${targetPath}/`) || newFolderPaths.includes(path)
      );
      if (state.project.assets[targetPath] || fileConflict || folderConflict) {
        result = "conflict";
        return state;
      }
      result = "moved";
      return commit(state, (project) => {
        const pathChanges = new Map<string, string>();
        for (const oldPath of movingAssets) {
          const newPath = `${targetPath}${oldPath.slice(source.length)}`;
          pathChanges.set(oldPath, newPath);
          const asset = project.assets[oldPath];
          delete project.assets[oldPath];
          project.assets[newPath] = { ...asset, path: newPath };
        }
        project.assetFolders = project.assetFolders
          .filter((path) => path !== source && !path.startsWith(`${source}/`))
          .concat(newFolderPaths);
        project.assetFolders = [...new Set(project.assetFolders)].sort();
        const rewrite = (attrs: Attributes) => {
          for (const [key, value] of Object.entries(attrs)) {
            const replacement = pathChanges.get(value);
            if (replacement) attrs[key] = replacement;
          }
        };
        rewrite(project.watchface);
        for (const resource of project.resources) {
          rewrite(resource.attrs);
          for (const child of resource.children) rewrite(child.attrs);
        }
        for (const theme of project.themes) {
          rewrite(theme.attrs);
          for (const layout of theme.layouts) rewrite(layout.attrs);
        }
      });
    });
    return result;
  },

  addTheme: (type = "normal") => set((state) => {
    const id = createId("theme");
    const update = commit(state, (project) => {
      const count = project.themes.filter((theme) => theme.attrs.type === type).length + 1;
      project.themes.push({
        id,
        attrs: { type, name: `${type === "AOD" ? "息屏" : "样式"}${count}`, bgColor: "#000000" },
        layouts: [],
      });
    });
    return { ...update, selectedThemeId: id, selection: { kind: "theme", themeId: id } as Selection };
  }),

  duplicateTheme: (themeId) => set((state) => {
    const sourceTheme = state.project.themes.find((entry) => entry.id === themeId);
    if (!sourceTheme) return state;
    const newId = createId("theme");
    const update = commit(state, (project) => {
      const clonedTheme: WatchfaceTheme = {
        id: newId,
        attrs: {
          ...sourceTheme.attrs,
          name: `${sourceTheme.attrs.name || "主题"} (副本)`,
        },
        layouts: sourceTheme.layouts.map((layout) => ({
          id: createId("layout"),
          attrs: { ...layout.attrs },
        })),
      };
      const index = project.themes.findIndex((entry) => entry.id === themeId);
      if (index >= 0) {
        project.themes.splice(index + 1, 0, clonedTheme);
      } else {
        project.themes.push(clonedTheme);
      }
    });
    return { ...update, selectedThemeId: newId, selection: { kind: "theme", themeId: newId } as Selection };
  }),

  updateTheme: (themeId, key, value) => set((state) => {
    const theme = state.project.themes.find((entry) => entry.id === themeId);
    if (!theme) return state;
    if (!isDeviceAttributeEditable(state.project.device, "Theme", key)) return state;

    const currentVal = theme.attrs[key] ?? "";
    if (currentVal === value) return state;

    const prevAttrs = { ...theme.attrs };
    const nextAttrs = { ...theme.attrs };
    if (value === "") delete nextAttrs[key];
    else nextAttrs[key] = value;

    const patch: ThemeAttrPatch = {
      kind: "theme_attrs",
      themeId,
      prevAttrs,
      nextAttrs,
    };

    const nextThemes = state.project.themes.map((t) =>
      t.id === themeId ? { ...t, attrs: nextAttrs } : t
    );
    const nextProject = { ...state.project, themes: nextThemes };

    return {
      project: nextProject,
      history: [state.project, ...state.history].slice(0, 200),
      historyPatches: [patch, ...state.historyPatches].slice(0, 200),
      future: [],
      futurePatches: [],
      contentRevision: state.contentRevision + 1,
    };
  }),

  removeTheme: (themeId) => set((state) => {
    if (state.project.themes.length <= 1) return state;
    const update = commit(state, (project) => {
      project.themes = project.themes.filter((theme) => theme.id !== themeId);
    });
    const nextTheme = update.project.themes[0]?.id ?? "";
    return { ...update, selectedThemeId: nextTheme, selection: { kind: "theme", themeId: nextTheme } as Selection };
  }),

  addLayout: (resourceId) => set((state) => {
    const resource = state.project.resources.find((entry) => entry.id === resourceId);
    if (!resource || !isDeviceResourceEditable(state.project.device, resource.type)) return state;
    const layoutId = createId("layout");
    const update = commit(state, (project) => {
      const theme = project.themes.find((entry) => entry.id === state.selectedThemeId);
      if (!theme) return;
      theme.layouts.push({
        id: layoutId,
        attrs: {
          ref: `@${getResourceName(resource)}`,
          x: String(Math.round(project.canvas.width / 2)),
          y: String(Math.round(project.canvas.height / 2)),
        },
      });
    });
    return {
      ...update,
      selection: { kind: "layout", themeId: state.selectedThemeId, layoutId } as Selection,
    };
  }),

  updateLayout: (themeId, layoutId, attrs) => set((state) => {
    const layout = state.project.themes
      .find((theme) => theme.id === themeId)
      ?.layouts.find((entry) => entry.id === layoutId);
    if (!layout) return state;

    const prevAttrs: Record<string, string> = { ...layout.attrs };
    const nextAttrs: Record<string, string> = { ...layout.attrs };
    let hasChanges = false;
    for (const [key, value] of Object.entries(attrs)) {
      if (!isDeviceAttributeEditable(state.project.device, "Layout", key)) continue;
      if (value === "") {
        if (key in nextAttrs) {
          delete nextAttrs[key];
          hasChanges = true;
        }
      } else if (value !== undefined && nextAttrs[key] !== value) {
        nextAttrs[key] = value;
        hasChanges = true;
      }
    }
    if (!hasChanges) return state;

    const patch: LayoutAttrPatch = {
      kind: "layout_attrs",
      themeId,
      layoutId,
      prevAttrs,
      nextAttrs,
    };

    const nextProject = cloneProject(state.project);
    applyHistoryPatch(nextProject, patch, false);

    const nextRevision = state.contentRevision + 1;
    const isMatchingSaved = state.savedSnapshot !== null && serializeProjectSnapshot(nextProject) === state.savedSnapshot;

    return {
      project: nextProject,
      history: [...state.history.slice(-49), state.project],
      future: [],
      historyPatches: [...(state.historyPatches || []).slice(-49), patch],
      futurePatches: [],
      contentRevision: nextRevision,
      savedRevision: isMatchingSaved ? nextRevision : state.savedRevision,
    };
  }),

  removeLayout: (themeId, layoutId) => set((state) => {
    const update = commit(state, (project) => {
      const theme = project.themes.find((entry) => entry.id === themeId);
      if (theme) theme.layouts = theme.layouts.filter((layout) => layout.id !== layoutId);
    });
    return { ...update, selection: { kind: "theme", themeId } as Selection };
  }),

  duplicateLayout: (themeId, layoutId) => set((state) => {
    const newId = createId("layout");
    const update = commit(state, (project) => {
      const theme = project.themes.find((entry) => entry.id === themeId);
      const index = theme?.layouts.findIndex((layout) => layout.id === layoutId) ?? -1;
      if (!theme || index < 0) return;
      const source = theme.layouts[index];
      theme.layouts.splice(index + 1, 0, {
        id: newId,
        attrs: {
          ...source.attrs,
          x: String(Number(source.attrs.x || 0) + 8),
          y: String(Number(source.attrs.y || 0) + 8),
        },
      });
    });
    return { ...update, selection: { kind: "layout", themeId, layoutId: newId } as Selection };
  }),

  moveLayout: (themeId, layoutId, direction) => set((state) => commit(state, (project) => {
    const theme = project.themes.find((entry) => entry.id === themeId);
    const index = theme?.layouts.findIndex((layout) => layout.id === layoutId) ?? -1;
    if (!theme || index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= theme.layouts.length) return;
    const [layout] = theme.layouts.splice(index, 1);
    theme.layouts.splice(target, 0, layout);
  })),

  reorderLayout: (themeId, layoutId, targetIndex) => set((state) => commit(state, (project) => {
    const theme = project.themes.find((entry) => entry.id === themeId);
    if (!theme) return;
    const sourceIndex = theme.layouts.findIndex((layout) => layout.id === layoutId);
    if (sourceIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(theme.layouts.length - 1, targetIndex));
    if (sourceIndex === nextIndex) return;
    const [layout] = theme.layouts.splice(sourceIndex, 1);
    theme.layouts.splice(nextIndex, 0, layout);
  })),

  undo: () => set((state) => {
    const previous = state.history.at(-1);
    if (!previous) return state;
    const nextRevision = state.contentRevision + 1;
    const isMatchingSaved = state.savedSnapshot !== null && serializeProjectSnapshot(previous) === state.savedSnapshot;
    const lastPatch = state.historyPatches?.at(-1);
    return {
      project: previous,
      history: state.history.slice(0, -1),
      future: [state.project, ...state.future.slice(0, 49)],
      historyPatches: state.historyPatches?.slice(0, -1) || [],
      futurePatches: lastPatch ? [lastPatch, ...(state.futurePatches || []).slice(0, 49)] : (state.futurePatches || []),
      contentRevision: nextRevision,
      savedRevision: isMatchingSaved ? nextRevision : state.savedRevision,
    };
  }),

  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    const nextRevision = state.contentRevision + 1;
    const isMatchingSaved = state.savedSnapshot !== null && serializeProjectSnapshot(next) === state.savedSnapshot;
    const firstPatch = state.futurePatches?.[0];
    return {
      project: next,
      history: [...state.history.slice(-49), state.project],
      future: state.future.slice(1),
      historyPatches: firstPatch ? [...(state.historyPatches || []).slice(-49), firstPatch] : (state.historyPatches || []),
      futurePatches: state.futurePatches?.slice(1) || [],
      contentRevision: nextRevision,
      savedRevision: isMatchingSaved ? nextRevision : state.savedRevision,
    };
  }),

  applyHistoryPatchAction: (patch, reverse = false) => set((state) => {
    const nextProject = cloneProject(state.project);
    applyHistoryPatch(nextProject, patch, reverse);
    const nextRevision = state.contentRevision + 1;
    const isMatchingSaved = state.savedSnapshot !== null && serializeProjectSnapshot(nextProject) === state.savedSnapshot;
    return {
      project: nextProject,
      history: [...state.history.slice(-49), state.project],
      future: [],
      historyPatches: [...(state.historyPatches || []).slice(-49), patch],
      futurePatches: [],
      contentRevision: nextRevision,
      savedRevision: isMatchingSaved ? nextRevision : state.savedRevision,
    };
  }),
}));

export function selectedTheme(state: Pick<EditorState, "project" | "selectedThemeId">) {
  return state.project.themes.find((theme) => theme.id === state.selectedThemeId) ?? state.project.themes[0];
}

export function getEditorState(): EditorState {
  return getState();
}

function getState(): EditorState {
  return useEditorStore.getState();
}
