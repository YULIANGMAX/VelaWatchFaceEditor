import { invokeTauri, isTauriApp } from "./nativeFileSystem";

export interface AdbDevice {
  id: string;
  state: string;
}

export interface AdbDeployOptions {
  deviceId?: string | null;
  pkgId: string;
  binPath?: string | null;
  binBytes?: number[] | null;
  cleanCache?: boolean;
  rebuildIndex?: boolean;
  reboot?: boolean;
}

export interface AdbDeployResult {
  success: boolean;
  logs: string[];
  error?: string | null;
}

export interface AdbEnvironmentStatus {
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * 检查系统 ADB 环境
 */
export async function checkAdbEnvironment(): Promise<AdbEnvironmentStatus> {
  if (!isTauriApp()) {
    return {
      available: false,
      error: "当前处于浏览器环境，ADB 部署仅在桌面客户端（Tauri）中可用。",
    };
  }

  try {
    const version = await invokeTauri<string>("adb_check_environment");
    return {
      available: true,
      version,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 获取当前已连接的 ADB 设备列表
 */
export async function listAdbDevices(): Promise<AdbDevice[]> {
  if (!isTauriApp()) {
    return [];
  }

  try {
    return await invokeTauri<AdbDevice[]>("adb_list_devices");
  } catch (err) {
    console.warn("获取 ADB 设备列表失败:", err);
    return [];
  }
}

/**
 * 执行表盘设备部署
 */
export async function deployWatchfaceToDevice(options: AdbDeployOptions): Promise<AdbDeployResult> {
  if (!isTauriApp()) {
    return {
      success: false,
      logs: ["部署失败：非桌面客户端环境"],
      error: "当前处于浏览器环境，ADB 部署仅在桌面客户端（Tauri）中可用。",
    };
  }

  try {
    return await invokeTauri<AdbDeployResult>("adb_deploy_watchface", {
      options: {
        device_id: options.deviceId || null,
        pkg_id: options.pkgId,
        bin_path: options.binPath || null,
        bin_bytes: options.binBytes || null,
        clean_cache: options.cleanCache ?? true,
        rebuild_index: options.rebuildIndex ?? true,
        reboot: options.reboot ?? true,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      logs: [`执行异常: ${errMsg}`],
      error: errMsg,
    };
  }
}
