import {
  createBlankProject,
  findDeviceProfile,
  normalizePath,
  RESERVED_ASSET_FOLDERS,
  type Attributes,
  type DeviceType,
  type ParseResult,
  type ProjectAsset,
  type WatchfaceProject,
} from "./model";
import { parseDescription, serializeDescription } from "./description";
import { parseManifest, serializeManifest } from "./xml";

export const PROJECT_PREVIEW_DIRECTORY = "_preview";
export const PROJECT_RESOURCES_DIRECTORY = "resources";
export const PROJECT_MANIFEST_PATH = `${PROJECT_RESOURCES_DIRECTORY}/manifest.xml`;
export const PROJECT_DESCRIPTION_PATH = "description.xml";

export async function hasProjectFiles(directory: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await directory.getFileHandle(PROJECT_DESCRIPTION_PATH);
    const resources = await directory.getDirectoryHandle(PROJECT_RESOURCES_DIRECTORY);
    await resources.getFileHandle("manifest.xml");
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return false;
    throw error;
  }
}

function objectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

async function imageMetadata(blob: Blob, path: string): Promise<Pick<ProjectAsset, "width" | "height" | "imageMetadataLoaded">> {
  if (!/\.png$/i.test(path) || typeof createImageBitmap !== "function") return {};
  try {
    const bitmap = await createImageBitmap(blob);
    const metadata = { width: bitmap.width, height: bitmap.height, imageMetadataLoaded: true };
    bitmap.close();
    return metadata;
  } catch {
    return { imageMetadataLoaded: true };
  }
}

export async function runConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const poolSize = Math.min(items.length, Math.max(1, limit));
  const pool = Array.from({ length: poolSize }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]!, idx);
    }
  });
  await Promise.all(pool);
}

interface DirectoryFile {
  path: string;
  file: File;
}

export interface AssetImportCandidate {
  asset: ProjectAsset;
  sourcePath: string;
}

export interface ResourceFileProgress {
  currentPath: string;
  completedFiles: number;
  totalFiles: number;
  writtenBytes: number;
  totalBytes: number;
}

export interface ResourceFileMoveResult {
  status: "moved" | "same" | "missing" | "conflict";
  path?: string;
}

export interface ResourceLibrarySnapshot {
  assets: Record<string, ProjectAsset>;
  folders: string[];
}

export interface ProjectLoadProgress {
  phase: "scanning" | "reading" | "parsing" | "done";
  message: string;
  current?: number;
  total?: number;
  percent?: number;
  detail?: string;
}

function descriptionDevice(description: Attributes | null, fallback: DeviceType): DeviceType {
  const declared = description?.deviceType;
  if (!declared) return fallback;
  const declaredProfile = findDeviceProfile(declared);
  if (declaredProfile) return declaredProfile.id;
  throw new Error(`description.xml 指定了不受支持的设备 ${declared}；本项目只支持已定义的 Vela 设备`);
}

function applyDescription(project: WatchfaceProject, description: Attributes | null): void {
  if (!description) return;
  project.description = { ...project.description, ...description };
}

async function collectDirectoryFiles(
  directory: FileSystemDirectoryHandle,
  prefix = "",
  directories: string[] = [],
): Promise<DirectoryFile[]> {
  const files: DirectoryFile[] = [];
  for await (const [name, entry] of directory.entries()) {
    const path = normalizePath(prefix ? `${prefix}/${name}` : name);
    if (entry.kind === "directory") {
      directories.push(path);
      files.push(...await collectDirectoryFiles(entry, path, directories));
    } else {
      files.push({ path, file: await entry.getFile() });
    }
  }
  return files;
}

export async function readResourceLibrary(
  projectDirectory: FileSystemDirectoryHandle,
  currentAssets: Record<string, ProjectAsset> = {},
  onProgress?: (progress: ProjectLoadProgress) => void,
): Promise<ResourceLibrarySnapshot> {
  onProgress?.({ phase: "scanning", message: "正在扫描资源目录...", percent: 10 });
  let resources: FileSystemDirectoryHandle;
  try {
    resources = await projectDirectory.getDirectoryHandle(PROJECT_RESOURCES_DIRECTORY);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return { assets: {}, folders: [] };
    throw error;
  }

  const folders: string[] = [];
  const entries = await collectDirectoryFiles(resources, "", folders);
  const resourceEntries = entries.filter((entry) => entry.path !== "manifest.xml");
  const total = resourceEntries.length;
  const assets: Record<string, ProjectAsset> = {};

  let count = 0;
  for (const entry of resourceEntries) {
    const current = currentAssets[entry.path];
    if (current && current.blob.size === entry.file.size && current.lastModified === entry.file.lastModified && (!/\.png$/i.test(entry.path) || current.imageMetadataLoaded)) {
      assets[entry.path] = current;
    } else {
      assets[entry.path] = {
        path: entry.path,
        blob: entry.file,
        url: objectUrl(entry.file),
        lastModified: entry.file.lastModified,
        ...await imageMetadata(entry.file, entry.path),
      };
    }
    count++;
    if (count % 5 === 0 || count === total) {
      onProgress?.({
        phase: "reading",
        message: `正在载入资源文件 (${count}/${total})...`,
        current: count,
        total,
        percent: total > 0 ? Math.round(15 + (count / total) * 75) : 85,
        detail: entry.path,
      });
    }
  }
  onProgress?.({ phase: "done", message: "资源准备就绪", percent: 100 });
  return { assets, folders: folders.sort() };
}

export async function importProjectFromEntries(
  entries: { path: string; file: File }[],
  directories: string[],
  device: DeviceType,
  rootName = "项目目录",
  onProgress?: (progress: ProjectLoadProgress) => void,
): Promise<ParseResult> {
  const manifests = entries.filter((entry) => entry.path.endsWith("manifest.xml"));

  if (manifests.length > 1 || (manifests.length === 1 && manifests[0].path !== PROJECT_MANIFEST_PATH)) {
    return {
      project: null,
      blocked: true,
      diagnostics: [
        {
          id: "manifest-count",
          severity: "error",
          code: "manifest-count",
          message: manifests.length > 1
            ? `项目目录必须且只能包含一个 manifest.xml，当前找到 ${manifests.length} 个`
            : `manifest.xml 必须位于 ${PROJECT_MANIFEST_PATH}`,
          location: rootName,
          boundary: true,
        },
      ],
    };
  }

  onProgress?.({ phase: "scanning", message: "正在读取项目描述与配置...", percent: 20 });
  const descriptionEntry = entries.find((entry) => entry.path === PROJECT_DESCRIPTION_PATH);
  let description: ReturnType<typeof parseDescription> | null = null;
  if (descriptionEntry) {
    try {
      description = parseDescription(await descriptionEntry.file.text());
    } catch (error) {
      return {
        project: null,
        blocked: true,
        diagnostics: [{
          id: "invalid-description",
          severity: "error",
          code: "invalid-description",
          message: error instanceof Error ? error.message : "description.xml 无法解析",
          location: PROJECT_DESCRIPTION_PATH,
          boundary: true,
        }],
      };
    }
  }

  let resolvedDevice: DeviceType;
  try {
    resolvedDevice = descriptionDevice(description, device);
  } catch (error) {
    return {
      project: null,
      blocked: true,
      diagnostics: [{
        id: "unsupported-device",
        severity: "error",
        code: "unsupported-device",
        message: error instanceof Error ? error.message : "项目设备不受支持",
        location: PROJECT_DESCRIPTION_PATH,
        boundary: true,
      }],
    };
  }

  const resourceEntries = entries.filter(
    (entry) => entry.path.startsWith(`${PROJECT_RESOURCES_DIRECTORY}/`) && entry.path !== PROJECT_MANIFEST_PATH,
  );
  const totalAssets = resourceEntries.length;
  const assets: Record<string, ProjectAsset> = {};

  onProgress?.({
    phase: "reading",
    message: totalAssets > 0 ? `正在载入资源文件 (0/${totalAssets})...` : "正在准备资源...",
    current: 0,
    total: totalAssets,
    percent: 25,
  });

  let loadedCount = 0;
  const CONCURRENCY_LIMIT = 16;
  await runConcurrent(resourceEntries, CONCURRENCY_LIMIT, async (entry) => {
    const path = entry.path.slice(PROJECT_RESOURCES_DIRECTORY.length + 1);
    const meta = await imageMetadata(entry.file, path);
    assets[path] = {
      path,
      blob: entry.file,
      url: objectUrl(entry.file),
      lastModified: entry.file.lastModified,
      ...meta,
    };
    loadedCount++;
    if (loadedCount % 5 === 0 || loadedCount === totalAssets) {
      const percent = totalAssets > 0 ? Math.round(25 + (loadedCount / totalAssets) * 60) : 85;
      onProgress?.({
        phase: "reading",
        message: `正在载入资源文件 (${loadedCount}/${totalAssets})...`,
        current: loadedCount,
        total: totalAssets,
        percent,
        detail: path,
      });
    }
  });

  const assetFolders = directories
    .filter((path) => path.startsWith(`${PROJECT_RESOURCES_DIRECTORY}/`))
    .map((path) => path.slice(PROJECT_RESOURCES_DIRECTORY.length + 1))
    .filter(Boolean);

  if (manifests.length === 0) {
    const project = createBlankProject(resolvedDevice);
    applyDescription(project, description);
    project.assets = assets;
    project.assetFolders = assetFolders;
    onProgress?.({ phase: "done", message: "新项目准备就绪", percent: 100 });
    return { project, diagnostics: [], blocked: false, newProject: true };
  }

  onProgress?.({ phase: "parsing", message: "正在解析表盘配置 (manifest.xml)...", percent: 90 });
  const result = parseManifest(
    await manifests[0].file.text(),
    resolvedDevice,
    assets,
  );
  if (result.project) {
    applyDescription(result.project, description);
    result.project.assetFolders = assetFolders;
  }
  if (!description) {
    result.diagnostics.push({
      id: "missing-description",
      severity: "warning",
      code: "missing-description",
      message: "项目缺少 description.xml，保存时将自动创建",
      location: PROJECT_DESCRIPTION_PATH,
    });
  }
  onProgress?.({ phase: "done", message: "项目载入完成", percent: 100 });
  return result;
}

export async function importProjectDirectory(
  directory: FileSystemDirectoryHandle,
  device: DeviceType,
  onProgress?: (progress: ProjectLoadProgress) => void,
): Promise<ParseResult> {
  onProgress?.({ phase: "scanning", message: "正在扫描项目目录结构...", percent: 10 });
  const directories: string[] = [];
  const entries = await collectDirectoryFiles(directory, "", directories);
  return importProjectFromEntries(entries, directories, device, directory.name, onProgress);
}

export async function importProjectVirtualFiles(
  virtualEntries: { path: string; file: File }[],
  device: DeviceType,
  onProgress?: (progress: ProjectLoadProgress) => void,
  rootName = "虚拟项目目录",
): Promise<ParseResult> {
  onProgress?.({ phase: "scanning", message: "正在解析内存文件列表...", percent: 10 });
  const dirSet = new Set<string>();
  for (const entry of virtualEntries) {
    const parts = entry.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  }
  const directories = Array.from(dirSet).sort();
  return importProjectFromEntries(virtualEntries, directories, device, rootName, onProgress);
}

export function createAssetImportCandidates(
  files: File[],
  prefix = "",
): AssetImportCandidate[] {
  const candidates: AssetImportCandidate[] = [];
  for (const file of files) {
    const sourcePath = normalizePath(file.name);
    const path = normalizePath(prefix ? `${prefix}/${sourcePath}` : sourcePath);
    if (!path || path === "manifest.xml") continue;
    candidates.push({
      sourcePath,
      asset: {
        path,
        blob: file,
        url: objectUrl(file),
        lastModified: file.lastModified,
      },
    });
  }
  return candidates;
}

async function writableFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("文件路径不能为空");
  let directory = root;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  return directory.getFileHandle(fileName, { create: true });
}

function resourcePathParts(path: string): string[] {
  const parts = normalizePath(path).split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error(`非法资源路径：${path}`);
  return parts;
}

async function resourceRoot(projectDirectory: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return projectDirectory.getDirectoryHandle(PROJECT_RESOURCES_DIRECTORY, { create: true });
}

async function resourceParent(
  projectDirectory: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
  const parts = resourcePathParts(path);
  const name = parts.pop();
  if (!name) throw new Error("资源路径不能为空");
  let directory = await resourceRoot(projectDirectory);
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return { directory, name };
}

async function entryExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TypeMismatchError") return true;
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TypeMismatchError") return true;
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  return false;
}

async function copyDirectory(
  source: FileSystemDirectoryHandle,
  target: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory") {
      await copyDirectory(entry, await target.getDirectoryHandle(name, { create: true }));
    } else {
      await writeFile(await target.getFileHandle(name, { create: true }), await entry.getFile());
    }
  }
}

export async function createResourceFolder(
  projectDirectory: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  let directory = await resourceRoot(projectDirectory);
  for (const part of resourcePathParts(path)) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
}

export async function writeResourceAssets(
  projectDirectory: FileSystemDirectoryHandle,
  assets: ProjectAsset[],
  onProgress?: (progress: ResourceFileProgress) => void,
): Promise<void> {
  const totalFiles = assets.length;
  const totalBytes = assets.reduce((sum, asset) => sum + asset.blob.size, 0);
  let completedFiles = 0;
  let writtenBytes = 0;
  let currentPath = assets[0]?.path ?? "";
  const report = () => onProgress?.({ currentPath, completedFiles, totalFiles, writtenBytes, totalBytes });

  report();
  const resources = await resourceRoot(projectDirectory);
  for (const asset of assets) {
    currentPath = asset.path;
    report();
    await writeBlob(
      await writableFile(resources, asset.path),
      asset.blob,
      (bytes) => {
        writtenBytes += bytes;
        report();
      },
    );
    completedFiles += 1;
    report();
  }
}

export async function deleteResourceFolder(
  projectDirectory: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const { directory, name } = await resourceParent(projectDirectory, path, false);
  await directory.removeEntry(name, { recursive: true });
}

export async function deleteResourceFile(
  projectDirectory: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const { directory, name } = await resourceParent(projectDirectory, path, false);
  await directory.removeEntry(name);
}

export async function renameResourceFile(
  projectDirectory: FileSystemDirectoryHandle,
  sourcePath: string,
  newName: string,
): Promise<"moved" | "same" | "missing" | "conflict"> {
  const source = normalizePath(sourcePath);
  const parts = resourcePathParts(source);
  const currentName = parts.pop() ?? "";
  if (currentName === newName) return "same";
  const targetPath = [...parts, newName].join("/");
  const sourceEntry = await resourceParent(projectDirectory, source, false);
  const targetEntry = await resourceParent(projectDirectory, targetPath, true);
  if (await entryExists(targetEntry.directory, targetEntry.name)) return "conflict";
  let file: File;
  try {
    file = await (await sourceEntry.directory.getFileHandle(sourceEntry.name)).getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return "missing";
    throw error;
  }
  await writeBlob(await targetEntry.directory.getFileHandle(targetEntry.name, { create: true }), file, () => undefined);
  await sourceEntry.directory.removeEntry(sourceEntry.name);
  return "moved";
}

export async function moveResourceFiles(
  projectDirectory: FileSystemDirectoryHandle,
  sourcePaths: string[],
  targetFolder: string,
  onProgress?: (progress: ResourceFileProgress) => void,
): Promise<ResourceFileMoveResult> {
  const normalizedFolder = normalizePath(targetFolder).replace(/^\/+|\/+$/g, "");
  const uniquePaths = [...new Set(sourcePaths.map((path) => normalizePath(path)).filter(Boolean))];
  const plannedTargets = new Set<string>();
  const files: Array<{
    sourcePath: string;
    targetPath: string;
    source: { directory: FileSystemDirectoryHandle; name: string };
    target: { directory: FileSystemDirectoryHandle; name: string };
    file: File;
  }> = [];

  for (const sourcePath of uniquePaths) {
    const fileName = resourcePathParts(sourcePath).at(-1) ?? "";
    const targetPath = normalizePath(normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName);
    if (sourcePath === targetPath) continue;
    if (plannedTargets.has(targetPath)) return { status: "conflict", path: targetPath };
    plannedTargets.add(targetPath);
    let source: { directory: FileSystemDirectoryHandle; name: string };
    try {
      source = await resourceParent(projectDirectory, sourcePath, false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return { status: "missing", path: sourcePath };
      throw error;
    }
    const target = await resourceParent(projectDirectory, targetPath, true);
    if (await entryExists(target.directory, target.name)) return { status: "conflict", path: targetPath };
    let file: File;
    try {
      file = await (await source.directory.getFileHandle(source.name)).getFile();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return { status: "missing", path: sourcePath };
      throw error;
    }
    files.push({ sourcePath, targetPath, source, target, file });
  }

  if (files.length === 0) return { status: "same" };
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, entry) => sum + entry.file.size, 0);
  let completedFiles = 0;
  let writtenBytes = 0;
  let currentPath = files[0].targetPath;
  const report = () => onProgress?.({ currentPath, completedFiles, totalFiles, writtenBytes, totalBytes });

  report();
  for (const entry of files) {
    currentPath = entry.targetPath;
    report();
    await writeBlob(
      await entry.target.directory.getFileHandle(entry.target.name, { create: true }),
      entry.file,
      (bytes) => {
        writtenBytes += bytes;
        report();
      },
    );
    await entry.source.directory.removeEntry(entry.source.name);
    completedFiles += 1;
    report();
  }
  return { status: "moved" };
}

export async function moveResourceFolder(
  projectDirectory: FileSystemDirectoryHandle,
  sourcePath: string,
  targetFolder: string,
): Promise<"moved" | "same" | "missing" | "conflict" | "invalid"> {
  const source = normalizePath(sourcePath).replace(/^\/+|\/+$/g, "");
  const target = normalizePath(targetFolder).replace(/^\/+|\/+$/g, "");
  const folderName = resourcePathParts(source).at(-1) ?? "";
  const targetPath = target ? `${target}/${folderName}` : folderName;
  if (source === targetPath) return "same";
  if (target === source || target.startsWith(`${source}/`)) return "invalid";
  return relocateResourceFolder(projectDirectory, source, targetPath);
}

export async function renameResourceFolder(
  projectDirectory: FileSystemDirectoryHandle,
  sourcePath: string,
  newName: string,
): Promise<"moved" | "same" | "missing" | "conflict"> {
  const source = normalizePath(sourcePath).replace(/^\/+|\/+$/g, "");
  const parts = resourcePathParts(source);
  const currentName = parts.pop() ?? "";
  if (currentName === newName) return "same";
  const targetPath = [...parts, newName].join("/");
  return relocateResourceFolder(projectDirectory, source, targetPath);
}

async function relocateResourceFolder(
  projectDirectory: FileSystemDirectoryHandle,
  source: string,
  targetPath: string,
): Promise<"moved" | "missing" | "conflict"> {
  let sourceEntry: { directory: FileSystemDirectoryHandle; name: string };
  try {
    sourceEntry = await resourceParent(projectDirectory, source, false);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return "missing";
    throw error;
  }
  const targetEntry = await resourceParent(projectDirectory, targetPath, true);
  if (await entryExists(targetEntry.directory, targetEntry.name)) return "conflict";
  let sourceDirectory: FileSystemDirectoryHandle;
  try {
    sourceDirectory = await sourceEntry.directory.getDirectoryHandle(sourceEntry.name);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return "missing";
    throw error;
  }
  const targetDirectory = await targetEntry.directory.getDirectoryHandle(targetEntry.name, { create: true });
  try {
    await copyDirectory(sourceDirectory, targetDirectory);
    await sourceEntry.directory.removeEntry(sourceEntry.name, { recursive: true });
  } catch (error) {
    await targetEntry.directory.removeEntry(targetEntry.name, { recursive: true }).catch(() => undefined);
    throw error;
  }
  return "moved";
}

async function writeFile(handle: FileSystemFileHandle, content: FileSystemWriteChunkType): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBlob(
  handle: FileSystemFileHandle,
  blob: Blob,
  onWrite: (bytes: number) => void,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    const chunkSize = 1024 * 1024;
    if (blob.size === 0) await writable.write(blob);
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const chunk = blob.slice(offset, Math.min(offset + chunkSize, blob.size));
      await writable.write(chunk);
      onWrite(chunk.size);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function saveProjectDirectory(
  directory: FileSystemDirectoryHandle,
  project: WatchfaceProject,
): Promise<void> {
  const resources = await directory.getDirectoryHandle(PROJECT_RESOURCES_DIRECTORY, { create: true });
  for (const folder of RESERVED_ASSET_FOLDERS) {
    await resources.getDirectoryHandle(folder, { create: true });
  }
  await writeFile(
    await resources.getFileHandle("manifest.xml", { create: true }),
    serializeManifest(project),
  );
  await writeFile(
    await directory.getFileHandle(PROJECT_DESCRIPTION_PATH, { create: true }),
    serializeDescription(project),
  );
}

export async function writeThemePreviewDirectory(
  directory: FileSystemDirectoryHandle,
  previews: Array<{ fileName: string; blob: Blob }>,
): Promise<void> {
  const resources = await directory.getDirectoryHandle(PROJECT_RESOURCES_DIRECTORY, { create: true });
  let previewDirectory: FileSystemDirectoryHandle;
  try {
    previewDirectory = await resources.getDirectoryHandle(PROJECT_PREVIEW_DIRECTORY);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    previewDirectory = await resources.getDirectoryHandle(PROJECT_PREVIEW_DIRECTORY, { create: true });
  }
  for await (const [name] of previewDirectory.entries()) {
    await previewDirectory.removeEntry(name, { recursive: true }).catch(() => undefined);
  }
  for (const preview of previews) {
    const handle = await previewDirectory.getFileHandle(preview.fileName, { create: true });
    await writeBlob(handle, preview.blob, () => undefined);
  }
}

export function disposeProjectAssets(project: WatchfaceProject | null): void {
  if (!project) return;
  for (const asset of Object.values(project.assets)) URL.revokeObjectURL(asset.url);
}

