import { createTauriDirectoryHandle, isTauriApp } from "./nativeFileSystem";

const DATABASE_NAME = "mi-watchface-editor";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const RECENT_PROJECTS_KEY = "recent-project-directories";
export const MAX_RECENT_PROJECTS = 10;
export const MAX_DISPLAYED_RECENT_PROJECTS = 5;

type DirectoryPermission = "granted" | "denied" | "prompt";

interface PermissionDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?(options: { mode: "readwrite" }): Promise<DirectoryPermission>;
  requestPermission?(options: { mode: "readwrite" }): Promise<DirectoryPermission>;
}

export interface RecentProjectDirectory {
  directory: FileSystemDirectoryHandle;
  projectName: string;
  projectPath: string;
  absolutePath?: string;
}

interface StoredProjectRecord {
  projectName: string;
  projectPath: string;
  absolutePath?: string;
  directory?: FileSystemDirectoryHandle;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 事务已中止"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  return requestResult(request);
}

async function storedRecentProjects(database: IDBDatabase): Promise<RecentProjectDirectory[]> {
  const transaction = database.transaction(STORE_NAME, "readonly");
  const rawList = await requestResult(
    transaction.objectStore(STORE_NAME).get(RECENT_PROJECTS_KEY) as IDBRequest<
      Array<StoredProjectRecord | RecentProjectDirectory> | undefined
    >,
  );
  await transactionDone(transaction);
  if (!rawList) return [];

  const result: RecentProjectDirectory[] = [];
  const inTauri = isTauriApp();

  for (const item of rawList) {
    const rawPath = item.absolutePath || ("directory" in item && (item.directory as { absolutePath?: string })?.absolutePath);
    if (inTauri && rawPath) {
      result.push({
        directory: createTauriDirectoryHandle(rawPath),
        projectName: item.projectName,
        projectPath: item.projectPath,
        absolutePath: rawPath,
      });
    } else if (item.directory) {
      result.push({
        directory: item.directory,
        projectName: item.projectName,
        projectPath: item.projectPath,
        ...(item.absolutePath ? { absolutePath: item.absolutePath } : {}),
      });
    } else if (inTauri && item.projectPath && (item.projectPath.includes(":\\") || item.projectPath.startsWith("/"))) {
      result.push({
        directory: createTauriDirectoryHandle(item.projectPath),
        projectName: item.projectName,
        projectPath: item.projectPath,
        absolutePath: item.projectPath,
      });
    }
  }
  return result;
}

async function sameDirectory(left: FileSystemDirectoryHandle, right: FileSystemDirectoryHandle): Promise<boolean> {
  const leftNative = (left as { absolutePath?: string }).absolutePath;
  const rightNative = (right as { absolutePath?: string }).absolutePath;
  if (leftNative && rightNative) {
    return leftNative.toLowerCase() === rightNative.toLowerCase();
  }
  try {
    return await left.isSameEntry(right);
  } catch {
    return left.name === right.name;
  }
}

function serializeProjectRecords(projects: RecentProjectDirectory[]): StoredProjectRecord[] {
  return projects.map((p) => {
    const pNativePath = p.absolutePath || (p.directory as { absolutePath?: string }).absolutePath;
    if (pNativePath) {
      return {
        projectName: p.projectName,
        projectPath: p.projectPath,
        absolutePath: pNativePath,
      };
    }
    return {
      projectName: p.projectName,
      projectPath: p.projectPath,
      directory: p.directory,
    };
  });
}

export async function getWorkspaceValue<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(
      transaction.objectStore(STORE_NAME).get(key) as IDBRequest<T | undefined>,
    );
    await transactionDone(transaction);
    return value;
  } finally {
    database.close();
  }
}

export async function setWorkspaceValue<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function loadRecentProjectDirectories(): Promise<RecentProjectDirectory[]> {
  const database = await openDatabase();
  try {
    return await storedRecentProjects(database);
  } finally {
    database.close();
  }
}

export async function rememberProjectDirectory(
  directory: FileSystemDirectoryHandle,
  projectName: string,
): Promise<RecentProjectDirectory[]> {
  const database = await openDatabase();
  try {
    const recentProjects = await storedRecentProjects(database);
    const remaining: RecentProjectDirectory[] = [];
    for (const project of recentProjects) {
      if (!await sameDirectory(project.directory, directory)) remaining.push(project);
    }
    const nativePath = (directory as { absolutePath?: string }).absolutePath;
    const projectPath = nativePath || `${directory.name}/description.xml`;
    const projects: RecentProjectDirectory[] = [{
      directory,
      projectName: projectName || "未命名表盘",
      projectPath,
      ...(nativePath ? { absolutePath: nativePath } : {}),
    }, ...remaining].slice(0, MAX_RECENT_PROJECTS);

    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(serializeProjectRecords(projects), RECENT_PROJECTS_KEY);
    await transactionDone(transaction);
    return projects;
  } finally {
    database.close();
  }
}

export async function forgetProjectDirectory(directory: FileSystemDirectoryHandle): Promise<RecentProjectDirectory[]> {
  const database = await openDatabase();
  try {
    const recentProjects = await storedRecentProjects(database);
    const projects: RecentProjectDirectory[] = [];
    for (const project of recentProjects) {
      if (!await sameDirectory(project.directory, directory)) projects.push(project);
    }
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (projects.length === 0) store.delete(RECENT_PROJECTS_KEY);
    else store.put(serializeProjectRecords(projects), RECENT_PROJECTS_KEY);
    await transactionDone(transaction);
    return projects;
  } finally {
    database.close();
  }
}

export async function queryProjectDirectoryPermission(
  directory: FileSystemDirectoryHandle,
): Promise<DirectoryPermission> {
  if (isTauriApp() || "absolutePath" in directory) {
    return "granted";
  }
  if (typeof (directory as PermissionDirectoryHandle).queryPermission === "function") {
    return (directory as PermissionDirectoryHandle).queryPermission!({ mode: "readwrite" });
  }
  return "granted";
}

export async function requestProjectDirectoryPermission(
  directory: FileSystemDirectoryHandle,
): Promise<DirectoryPermission> {
  if (isTauriApp() || "absolutePath" in directory) {
    return "granted";
  }
  if (typeof (directory as PermissionDirectoryHandle).requestPermission === "function") {
    return (directory as PermissionDirectoryHandle).requestPermission!({ mode: "readwrite" });
  }
  return "granted";
}
