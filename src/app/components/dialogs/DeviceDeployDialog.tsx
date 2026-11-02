import { useEffect, useRef, useState } from "react";
import {
  Smartphone,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Loader2,
  Terminal,
  FileCheck2,
} from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import {
  checkAdbEnvironment,
  listAdbDevices,
  deployWatchfaceToDevice,
  type AdbDevice,
  type AdbEnvironmentStatus,
} from "../../core/adb";
import { watchfaceDisplayName } from "../../core/model";
import { getResourceBinFile, readResourceBinBytes } from "../../core/compiler/storage";
import { joinNativePath } from "../../core/nativeFileSystem";

interface DeviceDeployDialogProps {
  open: boolean;
  onClose: () => void;
  directory?: FileSystemDirectoryHandle | null;
  binBytes?: Uint8Array | number[] | null;
  defaultWatchfaceId?: string;
}

export function DeviceDeployDialog({
  open,
  onClose,
  directory,
  binBytes,
  defaultWatchfaceId,
}: DeviceDeployDialogProps) {
  const project = useEditorStore((state) => state.project);

  // 表盘名称（展示用）
  const watchfaceName = watchfaceDisplayName(project) || project.watchface.name || project.description.name || "未命名表盘";

  // 表盘 ID（手环内部目录命名用，优先从 manifest.xml 的 watchface.id 读取，其次 description.xml 的 pkgName，其次目录名）
  const resolveWatchfaceId = () =>
    defaultWatchfaceId ||
    project.watchface.id ||
    project.description.pkgName ||
    directory?.name ||
    "test_watchface";

  const [watchfaceId, setWatchfaceId] = useState<string>(resolveWatchfaceId());

  // resource.bin 文件状态检测
  const [checkingBin, setCheckingBin] = useState(false);
  const [binFileInfo, setBinFileInfo] = useState<{
    size: number;
    lastModified?: number;
    nativePath?: string;
  } | null>(null);

  // ADB 环境与模拟器
  const [envStatus, setEnvStatus] = useState<AdbEnvironmentStatus | null>(null);
  const [checkingEnv, setCheckingEnv] = useState(false);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [loadingDevices, setLoadingDevices] = useState(false);

  // 执行阶段与日志
  const [deploying, setDeploying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [deploySuccess, setDeploySuccess] = useState<boolean | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动日志
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // 检查已存的 resource.bin
  const checkBinStatus = async () => {
    setCheckingBin(true);
    try {
      if (binBytes) {
        setBinFileInfo({
          size: binBytes.length,
          lastModified: Date.now(),
        });
        return;
      }

      if (!directory) {
        setBinFileInfo(null);
        return;
      }

      const file = await getResourceBinFile(directory);
      if (file) {
        let nativePath: string | undefined = undefined;
        if ("absolutePath" in directory && typeof (directory as { absolutePath: string }).absolutePath === "string") {
          nativePath = joinNativePath((directory as { absolutePath: string }).absolutePath, "resource.bin");
        }
        setBinFileInfo({
          size: file.size,
          lastModified: file.lastModified,
          nativePath,
        });
      } else {
        setBinFileInfo(null);
      }
    } catch {
      setBinFileInfo(null);
    } finally {
      setCheckingBin(false);
    }
  };

  // 模拟器列表刷新
  const refreshDevices = async () => {
    setLoadingDevices(true);
    try {
      const devList = await listAdbDevices();
      setDevices(devList);
      if (devList.length > 0) {
        if (!selectedDevice || !devList.some((d) => d.id === selectedDevice)) {
          setSelectedDevice(devList[0].id);
        }
      } else {
        setSelectedDevice("");
      }
    } finally {
      setLoadingDevices(false);
    }
  };

  const initEnvironment = async () => {
    setCheckingEnv(true);
    try {
      const status = await checkAdbEnvironment();
      setEnvStatus(status);
      if (status.available) {
        await refreshDevices();
      }
    } finally {
      setCheckingEnv(false);
    }
  };

  useEffect(() => {
    if (open) {
      void initEnvironment();
      void checkBinStatus();
      setDeploySuccess(null);
      setLogs([]);
      setStatusMessage("");
      setWatchfaceId(resolveWatchfaceId());
    }
  }, [open, directory, binBytes, defaultWatchfaceId, project.watchface.id, project.description.pkgName]);

  if (!open) return null;

  const hasBin = Boolean(binFileInfo || binBytes);

  const handleStartDeploy = async () => {
    const targetId = watchfaceId.trim();
    if (!targetId) {
      setStatusMessage("错误：请输入表盘ID");
      return;
    }

    if (!hasBin) {
      setStatusMessage("错误：未找到可部署的 resource.bin");
      return;
    }

    setDeploying(true);
    setDeploySuccess(null);
    setLogs([`>>> 开始部署表盘到模拟器: 表盘ID【${targetId}】...`]);
    setStatusMessage("正在准备 resource.bin 数据...");

    try {
      let finalBytes: number[] | null = null;
      let finalPath: string | null = null;

      if (binBytes) {
        finalBytes = Array.from(binBytes);
      } else if (binFileInfo?.nativePath) {
        finalPath = binFileInfo.nativePath;
      } else if (directory) {
        const rawBytes = await readResourceBinBytes(directory);
        if (!rawBytes) {
          throw new Error("未能读取到项目中的 resource.bin，请重新确认文件是否存在");
        }
        finalBytes = Array.from(rawBytes);
      } else {
        throw new Error("未找到可用的 resource.bin");
      }

      setLogs((prev) => [
        ...prev,
        finalPath
          ? `读取到物理文件: ${finalPath} (${(binFileInfo?.size ?? 0).toLocaleString()} 字节)`
          : `加载二进制流: ${finalBytes!.length.toLocaleString()} 字节`,
        `目标模拟器: ${selectedDevice || "默认模拟器"}`,
        `安装路径: /data/app/watchface/market/${targetId}/resource.bin`,
      ]);

      setStatusMessage("正在推送 resource.bin 并同步模拟器状态...");

      const res = await deployWatchfaceToDevice({
        deviceId: selectedDevice || null,
        pkgId: targetId,
        binBytes: finalBytes,
        binPath: finalPath,
        cleanCache: true,
        rebuildIndex: true,
        reboot: true,
      });

      setLogs((prev) => [...prev, ...res.logs]);

      if (res.success) {
        setDeploySuccess(true);
        setStatusMessage("部署成功！模拟器已自动重启生效。");
      } else {
        setDeploySuccess(false);
        setStatusMessage(`部署失败: ${res.error || "执行出错"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev, `❌ 部署异常: ${msg}`]);
      setDeploySuccess(false);
      setStatusMessage(`异常: ${msg}`);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        className="modal command-dialog device-deploy-dialog"
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 94vw)" }}
      >
        <header className="modal-header">
          <div className="modal-header-title-wrap">
            <Smartphone size={18} className="device-deploy-icon" />
            <h2>部署表盘</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={deploying}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="deploy-dialog-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          
          {/* 【顶部：表盘相关分区】 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* 表盘名称与表盘ID分别显示 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "4px", display: "block" }}>
                  表盘名称
                </label>
                <div
                  style={{
                    height: "34px",
                    borderRadius: "5px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#f9fafb",
                    padding: "0 10px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    color: "#111827",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={watchfaceName}
                >
                  {watchfaceName}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "4px", display: "block" }}>
                  表盘ID <span style={{ fontWeight: 400, color: "#6b7280" }}>(安装目录标识)</span>
                </label>
                <input
                  type="text"
                  value={watchfaceId}
                  onChange={(e) => setWatchfaceId(e.target.value)}
                  disabled={deploying}
                  placeholder="例如: test2"
                  style={{
                    width: "100%",
                    height: "34px",
                    borderRadius: "5px",
                    border: "1px solid #d1d5db",
                    padding: "0 10px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    backgroundColor: "#fff",
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "-2px" }}>
              模拟器安装路径: <code>/data/app/watchface/market/{watchfaceId || "..."}/resource.bin</code>
            </div>

            {/* resource.bin 状态检测 */}
            <div
              style={{
                padding: "9px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: hasBin ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${hasBin ? "#bbf7d0" : "#fecaca"}`,
                color: hasBin ? "#166534" : "#991b1b",
              }}
            >
              {checkingBin ? (
                <Loader2 size={16} className="spin" />
              ) : hasBin ? (
                <FileCheck2 size={16} color="#16a34a" />
              ) : (
                <AlertTriangle size={16} color="#dc2626" />
              )}

              <div style={{ flex: 1 }}>
                {checkingBin ? (
                  <span>正在检查项目中的 resource.bin...</span>
                ) : hasBin ? (
                  <span>
                    <strong>已就绪：</strong>已检测到待部署的 <code>resource.bin</code>
                    {binFileInfo?.size ? ` (${(binFileInfo.size / 1024).toFixed(1)} KB)` : ""}
                    {binFileInfo?.lastModified
                      ? ` · 修改时间: ${new Date(binFileInfo.lastModified).toLocaleTimeString()}`
                      : ""}
                  </span>
                ) : (
                  <span>
                    <strong>未找到 resource.bin：</strong>部署仅负责将现有 bin
                    推送到模拟器，不自动编译。请先在顶栏点击<strong>【编译BIN】</strong>生成后再执行部署。
                  </span>
                )}
              </div>

              <button
                type="button"
                className="secondary-button"
                style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
                disabled={checkingBin || deploying}
                onClick={() => void checkBinStatus()}
              >
                刷新文件
              </button>
            </div>
          </div>

          {/* 分隔线 */}
          <div style={{ height: "1px", backgroundColor: "#e5e7eb" }} />

          {/* 【中间：模拟器相关分区】 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* 1. ADB 环境状态条 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                backgroundColor: envStatus?.available ? "#edf7f3" : "#fff8e6",
                border: `1px solid ${envStatus?.available ? "#b9d9ce" : "#f1db9b"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {checkingEnv ? (
                  <Loader2 size={14} className="spin" />
                ) : envStatus?.available ? (
                  <CheckCircle2 size={14} color="#276b5d" />
                ) : (
                  <AlertTriangle size={14} color="#b45309" />
                )}
                <span style={{ color: envStatus?.available ? "#276b5d" : "#92400e" }}>
                  {checkingEnv
                    ? "正在检测系统 ADB 环境..."
                    : envStatus?.available
                    ? `ADB 环境就绪: ${envStatus.version?.split("\n")[0] || "已连接"}`
                    : `ADB 未就绪: ${envStatus?.error || "请确保 adb 已在系统环境变量 PATH 中"}`}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
                disabled={checkingEnv || deploying}
                onClick={() => void initEnvironment()}
              >
                重新检测
              </button>
            </div>

            {/* 2. 目标模拟器选择与刷新 */}
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563" }}>目标模拟器</label>
              <select
                style={{
                  height: "34px",
                  borderRadius: "5px",
                  border: "1px solid #d1d5db",
                  padding: "0 10px",
                  fontSize: "13px",
                  backgroundColor: "#fff",
                }}
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={loadingDevices || deploying || devices.length === 0}
              >
                {devices.length === 0 ? (
                  <option value="">(未检测到正在运行的手表模拟器)</option>
                ) : (
                  devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      模拟器实例 {d.id} ({d.state})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                className="secondary-button"
                style={{ height: "34px", padding: "0 10px", display: "flex", alignItems: "center", gap: "4px" }}
                disabled={loadingDevices || deploying}
                onClick={() => void refreshDevices()}
                title="刷新模拟器列表"
              >
                <RefreshCw size={14} className={loadingDevices ? "spin" : ""} />
                <span>刷新模拟器</span>
              </button>
            </div>
          </div>

          {/* 分隔线 */}
          <div style={{ height: "1px", backgroundColor: "#e5e7eb" }} />

          {/* 【下部：控制台相关分区】 */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "4px",
                fontSize: "12px",
                color: "#4b5563",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Terminal size={14} />
                <span>部署控制台</span>
              </div>
              {statusMessage && (
                <span
                  style={{
                    fontSize: "11px",
                    color:
                      deploySuccess === true
                        ? "#059669"
                        : deploySuccess === false
                        ? "#dc2626"
                        : "#2563eb",
                  }}
                >
                  {statusMessage}
                </span>
              )}
            </div>
            <div
              style={{
                height: "130px",
                backgroundColor: "#111827",
                borderRadius: "5px",
                padding: "8px 12px",
                overflowY: "auto",
                fontFamily: "Consolas, monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                color: "#10b981",
              }}
            >
              {logs.length === 0 ? (
                <span style={{ color: "#6b7280" }}>等待触发部署...</span>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      color:
                        log.includes("❌") || log.includes("失败") || log.includes("错误")
                          ? "#f87171"
                          : log.includes("成功") || log.includes("✔") || log.includes("✅")
                          ? "#34d399"
                          : "#e5e7eb",
                      wordBreak: "break-all",
                    }}
                  >
                    {log}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        <footer
          className="modal-actions"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            background: "#f9fafb",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {deploySuccess === true && (
              <span style={{ color: "#059669", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={16} /> 部署成功，模拟器已重启
              </span>
            )}
            {deploySuccess === false && (
              <span style={{ color: "#dc2626", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                <XCircle size={16} /> 部署失败，请查看控制台日志
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={deploying}
            >
              关闭
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={deploying || !envStatus?.available || devices.length === 0 || !hasBin}
              onClick={() => void handleStartDeploy()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: !hasBin ? "#9ca3af" : "#059669",
                color: "#ffffff",
                cursor: !hasBin ? "not-allowed" : "pointer",
              }}
              title={!hasBin ? "请先点击【编译BIN】生成 resource.bin 后再部署" : "推送到模拟器并生效"}
            >
              {deploying ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              <span>{deploying ? "正在部署..." : "开始部署到模拟器"}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
