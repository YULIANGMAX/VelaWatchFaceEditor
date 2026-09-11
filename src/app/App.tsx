import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Code2,
  FileCode2,
  FolderX,
  Loader2,
  Redo2,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { CanvasStage } from "./components/CanvasStage";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import {
  createBlankProject,
  createId,
  getDeviceProfile,
  getThemePreviewUrl,
  RESERVED_ASSET_FOLDERS,
  watchfaceDisplayName,
  type Diagnostic,
  type ParseResult,
  type WatchfaceProject,
} from "./core/model";
import { generateThemePreviews, type ThemePreviewImage } from "./components/previewImages";
import { AppIcon } from "./components/AppIcon";
import {
  disposeProjectAssets,
  hasProjectFiles,
  importProjectDirectory,
  importProjectVirtualFiles,
  readResourceLibrary,
  saveProjectDirectory,
  writeThemePreviewDirectory,
  type ProjectLoadProgress,
} from "./core/projectIO";
import {
  isNativeFileSystemSupported,
  parseWebkitDirectoryFileList,
} from "./core/browserFileSystem";
import {
  createTauriDirectoryHandle,
  isTauriApp,
  pickNativeProjectDirectory,
} from "./core/nativeFileSystem";
import {
  forgetProjectDirectory,
  getWorkspaceValue,
  loadRecentProjectDirectories,
  rememberProjectDirectory,
  requestProjectDirectoryPermission,
  setWorkspaceValue,
  type RecentProjectDirectory,
} from "./core/recentProject";
import { validateProject } from "./core/validation";
import { parseManifest, serializeManifest } from "./core/xml";
import { useEditorStore } from "./store/editorStore";
import { dialogManager } from "./core/dialog";
import { ModalDialogHost } from "./components/ModalDialogHost";
import { ProjectDirectoryGate } from "./components/gates/ProjectDirectoryGate";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

const MetricsDrawer = lazy(() =>
  import("./components/MetricsDrawer").then((module) => ({ default: module.MetricsDrawer }))
);
const DiagnosticsDrawer = lazy(() =>
  import("./components/drawers/DiagnosticsDrawer").then((module) => ({ default: module.DiagnosticsDrawer }))
);
const BoundaryDialog = lazy(() =>
  import("./components/dialogs/BoundaryDialog").then((module) => ({ default: module.BoundaryDialog }))
);
const BuildBinDialog = lazy(() =>
  import("./components/dialogs/BuildBinDialog").then((module) => ({ default: module.BuildBinDialog }))
);
const XmlEditorDialog = lazy(() =>
  import("./components/dialogs/XmlEditorDialog").then((module) => ({ default: module.XmlEditorDialog }))
);

export function App() {
  const project = useEditorStore((state) => state.project);
  const parseDiagnostics = useEditorStore((state) => state.parseDiagnostics);
  const loadProject = useEditorStore((state) => state.loadProject);
  const resetProject = useEditorStore((state) => state.resetProject);
  const setParseDiagnostics = useEditorStore((state) => state.setParseDiagnostics);
  const isProjectSelected = useEditorStore((state) => state.selection.kind === "project");
  const selection = useEditorStore((state) => state.selection);
  const setSelection = useEditorStore((state) => state.setSelection);
  const updateLayout = useEditorStore((state) => state.updateLayout);
  const removeLayout = useEditorStore((state) => state.removeLayout);
  const duplicateLayout = useEditorStore((state) => state.duplicateLayout);
  const history = useEditorStore((state) => state.history);
  const future = useEditorStore((state) => state.future);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const contentRevision = useEditorStore((state) => state.contentRevision);
  const savedRevision = useEditorStore((state) => state.savedRevision);
  const markSaved = useEditorStore((state) => state.markSaved);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const overrideCount = Object.keys(previewMetrics).length;
  const [projectDirectory, setProjectDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [isVirtualProject, setIsVirtualProject] = useState(false);
  const fallbackFolderInputRef = useRef<HTMLInputElement>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectDirectory[]>([]);
  const [restoringDirectory, setRestoringDirectory] = useState(true);
  const [loadProgress, setLoadProgress] = useState<ProjectLoadProgress | null>(null);
  const restoreRequest = useRef<Promise<RecentProjectDirectory[]> | null>(null);
  const [directoryDiagnostics, setDirectoryDiagnostics] = useState<Diagnostic[]>([]);
  const [saving, setSaving] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [boundaryResult, setBoundaryResult] = useState<ParseResult | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [xmlEditorOpen, setXmlEditorOpen] = useState(false);
  const [xmlDraft, setXmlDraft] = useState("");
  const [xmlDiagnostics, setXmlDiagnostics] = useState<Diagnostic[]>([]);
  const diagnostics = useMemo(
    () => [...parseDiagnostics, ...validateProject(project)],
    [parseDiagnostics, project],
  );
  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const warningCount = diagnostics.filter((entry) => entry.severity === "warning").length;
  const clean = contentRevision === savedRevision;

  const SIDEBAR_MIN_WIDTH = 260;
  const SIDEBAR_MAX_WIDTH = 560;
  const SIDEBAR_WIDTH_KEY = "sidebar-width";
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [sidebarResizing, setSidebarResizing] = useState(false);

  const INSPECTOR_MIN_WIDTH = 340;
  const INSPECTOR_MAX_WIDTH = 720;
  const INSPECTOR_DEFAULT_WIDTH = 380;
  const INSPECTOR_WIDTH_KEY = "inspector-width";
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [inspectorResizing, setInspectorResizing] = useState(false);

  useEffect(() => {
    let active = true;
    void getWorkspaceValue<number>(SIDEBAR_WIDTH_KEY).then((width) => {
      if (active && typeof width === "number" && Number.isFinite(width)) {
        setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
      }
    });
    void getWorkspaceValue<number>(INSPECTOR_WIDTH_KEY).then((width) => {
      if (active && typeof width === "number" && Number.isFinite(width)) {
        setInspectorWidth(Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, width)));
      }
    });
    return () => { active = false; };
  }, []);

  const startSidebarResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let width = startWidth;
    setSidebarResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(width);
    };
    const onUp = () => {
      setSidebarResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void setWorkspaceValue(SIDEBAR_WIDTH_KEY, width);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startInspectorResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    let width = startWidth;
    setInspectorResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      width = Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, startWidth - (moveEvent.clientX - startX)));
      setInspectorWidth(width);
    };
    const onUp = () => {
      setInspectorResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void setWorkspaceValue(INSPECTOR_WIDTH_KEY, width);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const acceptImport = (result: ParseResult, directory: FileSystemDirectoryHandle | null): boolean => {
    if (result.blocked || !result.project) {
      if (result.project) disposeProjectAssets(result.project);
      if (projectDirectory || isVirtualProject) setBoundaryResult({ ...result, project: null });
      else setDirectoryDiagnostics(result.diagnostics);
      return false;
    }
    disposeProjectAssets(project);
    loadProject(result.project, result.diagnostics, !result.newProject);
    setProjectDirectory(directory);
    setIsVirtualProject(directory === null);
    setDirectoryDiagnostics([]);
    return true;
  };

  useEffect(() => {
    if (!restoreRequest.current) restoreRequest.current = loadRecentProjectDirectories();
    let active = true;
    restoreRequest.current
      .then((projects) => {
        if (!active) return;
        setRecentProjects(projects);
      })
      .catch((error) => {
        if (!active) return;
        setDirectoryDiagnostics([{
          id: "directory-restore-error",
          severity: "warning",
          code: "directory-restore-error",
          message: error instanceof Error ? `无法恢复上次项目：${error.message}` : "无法恢复上次项目",
          location: "上次项目目录",
        }]);
      })
      .finally(() => {
        if (active) setRestoringDirectory(false);
      });
    return () => { active = false; };
  }, []);

  const confirmCreateNewProject = (directory: FileSystemDirectoryHandle): Promise<boolean> => {
    const displayTarget = (directory as { absolutePath?: string }).absolutePath || directory.name;
    return dialogManager.confirm({
      title: "新建项目确认",
      message: `目录 "${displayTarget}" 不是可读取的完整项目（需要 description.xml、resources/manifest.xml，且内容可解析）。是否在此创建新项目？`,
      confirmText: "创建新项目",
    });
  };

  const createProjectIfInvalid = async (directory: FileSystemDirectoryHandle, result: ParseResult): Promise<void> => {
    if (result.project) disposeProjectAssets(result.project);
    if (await confirmCreateNewProject(directory)) await createNewProjectInDirectory(directory);
  };

  const createNewProjectInDirectory = async (directory: FileSystemDirectoryHandle) => {
    setLoadProgress({ phase: "scanning", message: "正在初始化新项目...", percent: 10 });
    try {
      const library = await readResourceLibrary(directory, {}, setLoadProgress);
      const newProject = createBlankProject(project.device);
      newProject.assets = library.assets;
      newProject.assetFolders = [...new Set([...library.folders, ...RESERVED_ASSET_FOLDERS])].sort();
      await saveProjectDirectory(directory, newProject);
      const result: ParseResult = { project: newProject, diagnostics: [], blocked: false };
      if (acceptImport(result, directory)) {
        setRecentProjects(await rememberProjectDirectory(directory, newProject.description.name || watchfaceDisplayName(newProject)));
      }
    } finally {
      setLoadProgress(null);
    }
  };

  const handleFallbackFolderSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    event.target.value = "";
    if (!files || files.length === 0) return;
    try {
      setLoadProgress({ phase: "scanning", message: "正在读取虚拟目录...", percent: 10 });
      const virtualEntries = parseWebkitDirectoryFileList(files);
      const result = await importProjectVirtualFiles(virtualEntries, project.device, setLoadProgress);
      if (result.blocked || !result.project) {
        setLoadProgress(null);
        setDirectoryDiagnostics(result.diagnostics);
        return;
      }
      if (result.project) {
        acceptImport(result, null);
      }
    } catch (error) {
      setDirectoryDiagnostics([{
        id: createId("directory"),
        severity: "error",
        code: "directory-open-error",
        message: error instanceof Error ? error.message : "无法解析所选目录文件",
        location: "虚拟文件系统",
      }]);
    } finally {
      setLoadProgress(null);
    }
  };

  const chooseProjectDirectory = async () => {
    let directory: FileSystemDirectoryHandle;
    if (isTauriApp()) {
      try {
        const selectedPath = await pickNativeProjectDirectory();
        if (!selectedPath) return;
        directory = createTauriDirectoryHandle(selectedPath);
      } catch (error) {
        setDirectoryDiagnostics([{
          id: createId("directory"),
          severity: "error",
          code: "directory-open-error",
          message: error instanceof Error ? error.message : "无法打开系统目录",
          location: "系统对话框",
        }]);
        return;
      }
    } else if (isNativeFileSystemSupported()) {
      try {
        directory = await window.showDirectoryPicker({ mode: "readwrite" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDirectoryDiagnostics([{
          id: createId("directory"),
          severity: "error",
          code: "directory-open-error",
          message: error instanceof Error ? error.message : "无法打开目录",
          location: "目录选择",
        }]);
        return;
      }
    } else {
      fallbackFolderInputRef.current?.click();
      return;
    }

    try {
      setLoadProgress({ phase: "scanning", message: "正在检验目录文件...", percent: 10 });
      const filesPresent = await hasProjectFiles(directory);
      if (!filesPresent) {
        if (!await confirmCreateNewProject(directory)) {
          setLoadProgress(null);
          return;
        }
        await createNewProjectInDirectory(directory);
        return;
      }
      const result = await importProjectDirectory(directory, project.device, setLoadProgress);
      if (result.blocked || !result.project) {
        setLoadProgress(null);
        await createProjectIfInvalid(directory, result);
        return;
      }
      if (result.project) {
        if (acceptImport(result, directory)) {
          setRecentProjects(await rememberProjectDirectory(directory, result.project.description.name || watchfaceDisplayName(result.project)));
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDirectoryDiagnostics([{
        id: createId("directory"),
        severity: "error",
        code: "directory-open-error",
        message: error instanceof Error ? error.message : "无法打开目录",
        location: "目录选择",
      }]);
    } finally {
      setLoadProgress(null);
    }
  };

  const openRecentProject = async (recentProject: RecentProjectDirectory) => {
    try {
      setLoadProgress({ phase: "scanning", message: `正在获取目录权限...`, percent: 5 });
      const granted = await requestProjectDirectoryPermission(recentProject.directory);
      if (!granted) {
        setDirectoryDiagnostics([{
          id: createId("directory"),
          severity: "warning",
          code: "directory-permission-denied",
          message: "未获得项目目录读写权限",
          location: recentProject.directory.name,
        }]);
        return;
      }
      const result = await importProjectDirectory(recentProject.directory, project.device, setLoadProgress);
      if (result.blocked || !result.project) {
        setLoadProgress(null);
        await createProjectIfInvalid(recentProject.directory, result);
        return;
      }
      if (result.project) {
        if (acceptImport(result, recentProject.directory)) {
          setRecentProjects(await rememberProjectDirectory(
            recentProject.directory,
            result.project.description.name || watchfaceDisplayName(result.project),
          ));
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRecentProjects(await forgetProjectDirectory(recentProject.directory).catch(() => recentProjects));
      setDirectoryDiagnostics([{
        id: createId("directory"),
        severity: "error",
        code: "directory-resume-error",
        message: error instanceof Error ? error.message : "无法继续使用上次项目目录",
        location: recentProject.directory.name,
      }]);
    } finally {
      setLoadProgress(null);
    }
  };

  const handleRemoveRecentProject = async (recentProject: RecentProjectDirectory) => {
    try {
      const updated = await forgetProjectDirectory(recentProject.directory);
      setRecentProjects(updated);
    } catch {
      // 忽略移除失败
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!clean && projectDirectory) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [clean, projectDirectory]);

  const closeProject = async () => {
    if (!clean) {
      const ok = await dialogManager.confirm({
        title: "未保存提示",
        message: "当前项目有未保存的修改，关闭后这些更改将会丢失。确定要关闭项目吗？",
        confirmText: "确定关闭",
        cancelText: "取消",
        danger: true,
      });
      if (!ok) return;
    }
    disposeProjectAssets(project);
    resetProject(project.device);
    setProjectDirectory(null);
    setIsVirtualProject(false);
    setDirectoryDiagnostics([]);
    setDiagnosticsOpen(false);
    setMetricsOpen(false);
    setBoundaryResult(null);
    setBuildOpen(false);
    setXmlEditorOpen(false);
    setXmlDiagnostics([]);
  };

  const applyThemePreviews = (current: WatchfaceProject, previews: ThemePreviewImage[]): WatchfaceProject => {
    const staleIds = current.resources
      .filter((entry) => entry.type === "Image" && (entry.attrs.name ?? "").startsWith("_preview_"))
      .map((entry) => entry.id);
    const resources = current.resources.filter((entry) => !staleIds.includes(entry.id));
    const assets = { ...current.assets };
    const keepAssetPaths = new Set(previews.map((entry) => `_preview/${entry.fileName}`));
    for (const path of Object.keys(assets)) {
      if (path.startsWith("_preview/") && !keepAssetPaths.has(path)) {
        const asset = assets[path];
        if (asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url);
        delete assets[path];
      }
    }
    const themes = current.themes.map((theme) => ({ ...theme, attrs: { ...theme.attrs } }));
    for (const preview of previews) {
      const theme = themes.find((entry) => entry.id === preview.themeId);
      if (!theme) continue;
      const resourceName = preview.resourceName;
      const assetPath = `_preview/${preview.fileName}`;
      if (!assets[assetPath]) {
        assets[assetPath] = {
          path: assetPath,
          blob: preview.blob,
          url: URL.createObjectURL(preview.blob),
          width: current.canvas.width,
          height: current.canvas.height,
          imageMetadataLoaded: true,
        };
      }
      const existing = resources.find((entry) => entry.type === "Image" && entry.attrs.name === resourceName);
      if (existing) {
        existing.attrs = { ...existing.attrs, src: assetPath };
      } else {
        resources.push({
          id: createId("resource"),
          type: "Image",
          attrs: { name: resourceName, src: assetPath, compressMethod: "RLEReversed", format: "RGBA32", recolorEnable: "false" },
          children: [],
        });
      }
      theme.attrs.preview = `@${resourceName}`;
    }
    const assetFolders = current.assetFolders.includes("_preview")
      ? current.assetFolders
      : [...current.assetFolders, "_preview"];
    return { ...current, resources, assets, themes, assetFolders };
  };

  const saveProject = async () => {
    if (saving) return;
    if (!projectDirectory) {
      if (isVirtualProject) {
        void dialogManager.alert({
          title: "内存项目提示",
          message: "当前在 Safari/Firefox 虚拟内存模式下编辑。您可以直接使用右上角的“打包”功能编译导出完整的表盘安装包！",
          type: "info",
        });
      }
      return;
    }
    setSaving(true);
    try {
      const previews = await generateThemePreviews(project).catch((error) => {
        console.warn("生成主题预览图失败，已跳过：", error);
        return [] as ThemePreviewImage[];
      });
      let target = project;
      if (previews.length > 0) {
        await writeThemePreviewDirectory(projectDirectory, previews);
        target = applyThemePreviews(project, previews);
        useEditorStore.setState({ project: target });
      }
      await saveProjectDirectory(projectDirectory, target);
      setParseDiagnostics(parseDiagnostics.filter((entry) => entry.code !== "missing-description"));
      markSaved();
      setRecentProjects(await rememberProjectDirectory(projectDirectory, target.description.name || watchfaceDisplayName(target)));
    } catch (error) {
      void dialogManager.alert({
        title: "保存失败",
        message: error instanceof Error ? error.message : "保存项目时发生未知错误",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const openXmlEditor = () => {
    setXmlDraft(serializeManifest(project));
    setXmlDiagnostics([]);
    setXmlEditorOpen(true);
  };

  const applyXml = () => {
    const result = parseManifest(xmlDraft, project.device, project.assets);
    if (result.blocked || !result.project) {
      setXmlDiagnostics(result.diagnostics);
      return;
    }
    result.project.description = { ...project.description };
    loadProject(result.project, result.diagnostics, false);
    setXmlDiagnostics([]);
    setXmlEditorOpen(false);
  };

  const handleBuild = () => {
    if (errorCount > 0 || saving || !clean) return;
    setBuildOpen(true);
  };

  const hasActiveProject = Boolean(projectDirectory || isVirtualProject);

  useKeyboardShortcuts({
    onSave: () => {
      if (!clean && !saving) void saveProject();
    },
    onUndo: () => {
      if (history.length > 0) undo();
    },
    onRedo: () => {
      if (future.length > 0) redo();
    },
    onNudge: (dx, dy) => {
      if (selection.kind !== "layout") return;
      const theme = project.themes.find((t) => t.id === selection.themeId);
      const layout = theme?.layouts.find((l) => l.id === selection.layoutId);
      if (!layout) return;
      const currentX = Number(layout.attrs.x || 0);
      const currentY = Number(layout.attrs.y || 0);
      updateLayout(selection.themeId, selection.layoutId, {
        x: String(currentX + dx),
        y: String(currentY + dy),
      });
    },
    onDelete: () => {
      if (selection.kind !== "layout") return;
      removeLayout(selection.themeId, selection.layoutId);
    },
    onDuplicate: () => {
      if (selection.kind !== "layout") return;
      duplicateLayout(selection.themeId, selection.layoutId);
    },
    disabled: !hasActiveProject,
  });

  if (!hasActiveProject) {
    return (
      <>
        <ProjectDirectoryGate
          diagnostics={directoryDiagnostics}
          restoring={restoringDirectory}
          loading={loadProgress}
          recentProjects={recentProjects}
          onOpenDirectory={chooseProjectDirectory}
          onOpenRecent={openRecentProject}
          onRemoveRecent={handleRemoveRecentProject}
        />
        <input
          ref={fallbackFolderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in HTML5 browsers
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={handleFallbackFolderSelected}
        />
        <ModalDialogHost />
      </>
    );
  }

  const firstTheme = project.themes[0];
  const firstThemePreviewUrl = getThemePreviewUrl(project, firstTheme);

  return (
    <div className="app-shell">
      <header className="topbar">
        {/* 左区：项目身份、编辑XML、保存项目、编译BIN与关闭项目 */}
        <div className="topbar-left">
          <button
            type="button"
            className={`topbar-project-capsule${isProjectSelected ? " is-active" : ""}`}
            onClick={() => setSelection({ kind: "project" })}
            aria-pressed={isProjectSelected}
            title={`${project.description.name || watchfaceDisplayName(project)} · ${getDeviceProfile(project.device).label}，点击编辑项目属性`}
          >
            <span className="capsule-preview-thumb" aria-hidden="true">
              {firstThemePreviewUrl ? (
                <img
                  src={firstThemePreviewUrl}
                  alt=""
                  className="capsule-preview-img"
                />
              ) : (
                <AppIcon size={24} />
              )}
            </span>
            <span className="topbar-project-details">
              <span className="capsule-project-name">{project.description.name || watchfaceDisplayName(project)}</span>
              <span className="capsule-device-name">{getDeviceProfile(project.device).label}</span>
            </span>
          </button>

          <div className="topbar-divider" />

          <button
            type="button"
            className="topbar-xml-btn"
            onClick={openXmlEditor}
            title="查看与编辑 manifest.xml 源码"
          >
            <FileCode2 size={14} />
            <span>编辑XML</span>
          </button>

          <button
            type="button"
            className={`topbar-save-btn${!clean ? " is-dirty" : ""}`}
            disabled={saving || clean}
            onClick={saveProject}
            title={saving ? "正在保存项目" : clean ? "所有修改均已保存 (Ctrl+S)" : "有未保存修改，点击保存项目 (Ctrl+S)"}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            <span>{saving ? "保存中" : "保存项目"}</span>
          </button>

          <div className="topbar-divider" />

          <button
            type="button"
            className="build-action-btn"
            disabled={errorCount > 0 || saving || !clean}
            onClick={handleBuild}
            title={
              errorCount > 0
                ? "项目存在阻断错误，无法编译。请先查看右侧诊断并修复"
                : !clean
                ? "当前有未保存修改，必须手动保存项目后方可编译"
                : saving
                ? "正在保存项目，请稍候"
                : "打开编译打包面板"
            }
          >
            <Code2 size={14} />
            <span>编译BIN</span>
          </button>

          <div className="topbar-divider" />

          <button
            type="button"
            className="topbar-close-btn"
            disabled={saving}
            onClick={closeProject}
            title="关闭当前项目"
          >
            <FolderX size={14} />
            <span>关闭项目</span>
          </button>
        </div>

        {/* 中间：撤销与重做 */}
        <div className="topbar-center">
          <div className="topbar-history-capsule" role="group" aria-label="历史操作">
            <button
              type="button"
              className="history-btn"
              disabled={history.length === 0}
              onClick={undo}
              title="撤销 (Ctrl+Z)"
              aria-label="撤销"
            >
              <Undo2 size={16} />
            </button>
            <div className="history-divider" aria-hidden="true" />
            <button
              type="button"
              className="history-btn"
              disabled={future.length === 0}
              onClick={redo}
              title="重做 (Ctrl+Y)"
              aria-label="重做"
            >
              <Redo2 size={16} />
            </button>
          </div>
        </div>

        {/* 右区：调试工具与项目诊断 */}
        <div className="topbar-right">
          <button
            type="button"
            className={`topbar-metrics-btn${metricsOpen || overrideCount > 0 ? " is-active" : ""}`}
            onClick={() => setMetricsOpen((prev) => !prev)}
            aria-expanded={metricsOpen}
            title={overrideCount > 0 ? `模拟数据 (已自定义 ${overrideCount} 项)` : "统一编辑模拟数据"}
          >
            <Activity size={14} className="metrics-icon" />
            <span>模拟数据</span>
            {overrideCount > 0 ? <span className="topbar-metrics-badge">{overrideCount}</span> : null}
          </button>

          {/* 诊断在最右边 */}
          <button
            type="button"
            className={`build-health-btn${diagnosticsOpen ? " is-active" : ""}${errorCount > 0 ? " is-error" : warningCount > 0 ? " is-warning" : " is-clean"}`}
            onClick={() => setDiagnosticsOpen((prev) => !prev)}
            aria-expanded={diagnosticsOpen}
            title={
              diagnosticsOpen
                ? "关闭项目诊断"
                : errorCount > 0
                ? `发现 ${errorCount} 个阻断错误，点击查看并修复`
                : warningCount > 0
                ? `发现 ${warningCount} 个潜在警告，点击查看`
                : "项目质量良好，点击查看诊断详情"
            }
          >
            {errorCount ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
            <span>{errorCount ? `${errorCount} 错误` : warningCount ? `${warningCount} 警告` : "良好"}</span>
          </button>
        </div>
      </header>

      <main
        className={`workspace${sidebarResizing || inspectorResizing ? " is-resizing" : ""}`}
        style={{
          "--sidebar-w": `${sidebarWidth}px`,
          "--inspector-w": `${inspectorWidth}px`,
        } as React.CSSProperties}
      >
        <Sidebar projectDirectory={projectDirectory} />
        <div className="sidebar-resizer" onPointerDown={startSidebarResize} title="拖动调整左侧栏宽度" />
        <CanvasStage />
        <div className="inspector-resizer" onPointerDown={startInspectorResize} title="拖动调整属性栏宽度" />
        <Inspector />
      </main>

      <Suspense fallback={null}>
        {diagnosticsOpen && (
          <DiagnosticsDrawer open={diagnosticsOpen} diagnostics={diagnostics} project={project} onClose={() => setDiagnosticsOpen(false)} />
        )}
        {metricsOpen && (
          <MetricsDrawer open={metricsOpen} onClose={() => setMetricsOpen(false)} />
        )}
        {boundaryResult && (
          <BoundaryDialog result={boundaryResult} onClose={() => setBoundaryResult(null)} />
        )}
        {buildOpen && (
          <BuildBinDialog open={buildOpen} directory={projectDirectory} diagnostics={diagnostics} clean={clean} saving={saving} onClose={() => setBuildOpen(false)} />
        )}
        {xmlEditorOpen && (
          <XmlEditorDialog
            open={xmlEditorOpen}
            value={xmlDraft}
            diagnostics={xmlDiagnostics}
            onChange={setXmlDraft}
            onApply={applyXml}
            onClose={() => setXmlEditorOpen(false)}
          />
        )}
      </Suspense>
      <ModalDialogHost />
    </div>
  );
}
