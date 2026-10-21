import { memo, useMemo, useState, useEffect, useCallback } from "react";
import {
  ArrowUpRight,
  Binary,
  Braces,
  ChevronDown,
  Check,
  Copy,
  Edit3,
  Eye,
  File,
  FileCode,
  FileText,
  Layers,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  isImageAsset,
  normalizePath,
  type WatchfaceProject,
} from "../core/model";
import {
  RESOURCE_DEFINITION_MAP,
  THEME_FIELDS,
  WATCHFACE_FIELDS,
} from "../editor/manifestEditorSchema";
import { useEditorStore, type Selection } from "../store/editorStore";
import { dialogManager } from "../core/dialog";
import { deleteResourceFile, writeResourceTextFile } from "../core/projectIO";
import { InspectorCard, InspectorHeader, InspectorNavigation } from "./Inspector";
import { CodeEditorDialog } from "./dialogs/CodeEditorDialog";

export type AssetReference =
  | { kind: "watchface"; fieldLabel: string; selection: Selection }
  | { kind: "theme"; themeId: string; themeName: string; fieldLabel: string; selection: Selection }
  | { kind: "resource"; resourceId: string; resourceName: string; resourceType: string; fieldLabel: string; selection: Selection }
  | { kind: "child"; resourceId: string; resourceName: string; resourceType: string; childIndex: number; fieldLabel: string; selection: Selection };

export function findAssetReferences(project: WatchfaceProject, assetPath: string): AssetReference[] {
  const normalizedTarget = normalizePath(assetPath);
  const results: AssetReference[] = [];

  // 1. 表盘根配置引用检查
  for (const [key, value] of Object.entries(project.watchface)) {
    if (value && normalizePath(value) === normalizedTarget) {
      const fieldDef = WATCHFACE_FIELDS.find((f) => f.key === key);
      const fieldLabel = fieldDef?.label || (key === "preview" ? "预览图片" : key);
      results.push({
        kind: "watchface",
        fieldLabel,
        selection: { kind: "project" },
      });
    }
  }

  // 2. 主题引用检查
  for (const theme of project.themes) {
    for (const [key, value] of Object.entries(theme.attrs)) {
      if (value && normalizePath(value) === normalizedTarget) {
        const fieldDef = THEME_FIELDS.find((f) => f.key === key);
        results.push({
          kind: "theme",
          themeId: theme.id,
          themeName: theme.attrs.name || "未命名主题",
          fieldLabel: fieldDef?.label || key,
          selection: { kind: "theme", themeId: theme.id },
        });
      }
    }
  }

  // 3. 资源及子项引用检查
  for (const resource of project.resources) {
    const resDef = RESOURCE_DEFINITION_MAP[resource.type];
    const resourceName = resource.attrs.name || "未命名资源";
    const resourceType = resDef?.label || resource.type;

    for (const [key, value] of Object.entries(resource.attrs)) {
      if (value && normalizePath(value) === normalizedTarget) {
        const fieldDef = resDef?.fields.find((f) => f.key === key);
        results.push({
          kind: "resource",
          resourceId: resource.id,
          resourceName,
          resourceType,
          fieldLabel: fieldDef?.label || key,
          selection: { kind: "resource", resourceId: resource.id },
        });
      }
    }

    if (resource.children && resDef?.child) {
      resource.children.forEach((child, childIndex) => {
        for (const [key, value] of Object.entries(child.attrs)) {
          if (value && normalizePath(value) === normalizedTarget) {
            const childFieldDef = resDef.child?.fields.find((f) => f.key === key);
            results.push({
              kind: "child",
              resourceId: resource.id,
              resourceName,
              resourceType,
              childIndex,
              fieldLabel: childFieldDef?.label || key,
              selection: { kind: "resource", resourceId: resource.id },
            });
          }
        }
      });
    }
  }

  return results;
}

export function labelForAssetReference(reference: AssetReference): string {
  switch (reference.kind) {
    case "watchface":
      return `表盘属性 · ${reference.fieldLabel}`;
    case "theme":
      return `主题「${reference.themeName}」· ${reference.fieldLabel}`;
    case "resource":
      return `${reference.resourceType}「${reference.resourceName}」· ${reference.fieldLabel}`;
    case "child":
      return `${reference.resourceType}「${reference.resourceName}」· 子项 ${reference.childIndex + 1} · ${reference.fieldLabel}`;
  }
}

export function AssetReferences({ references }: { references: AssetReference[] }) {
  const navigateTo = useEditorStore((state) => state.navigateTo);
  const [expanded, setExpanded] = useState(false);
  if (references.length === 0) return null;

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
      {expanded ? (
        <div className="resource-references-list">
          {references.map((reference, index) => (
            <button
              type="button"
              key={`${reference.kind}-${index}`}
              onClick={() => navigateTo(reference.selection)}
              title="跳转到引用位置"
            >
              <span>{labelForAssetReference(reference)}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function isTextAsset(path: string, blob?: Blob): boolean {
  if (/\.(lua|json|xml|txt|md|js|ts|css|html|csv)$/i.test(path)) return true;
  if (blob?.type?.startsWith("text/")) return true;
  return false;
}

export function formatFileSizeKB(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB (${bytes.toLocaleString()} 字节)`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB (${bytes.toLocaleString()} 字节)`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "未知";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "未知";
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, "0");
  const D = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function getAspectRatio(w: number, h: number): string {
  if (!w || !h) return "";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h);
  const rw = w / divisor;
  const rh = h / divisor;
  if (rw <= 32 && rh <= 32) {
    return `${rw}:${rh}`;
  }
  return `${(w / h).toFixed(2)}:1`;
}

export function getAssetTypeBadge(path: string, isImg: boolean, isText: boolean): {
  label: string;
  color: string;
  desc: string;
  category: "image" | "lua" | "data" | "text" | "binary" | "other";
} {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) {
    return { label: "PNG", color: "#38a096", desc: "PNG 便携式网络图形", category: "image" };
  }
  if (lower.endsWith(".rle")) {
    return { label: "LVGL RLE", color: "#d97706", desc: "LVGL 行程编码压缩图 (直接解码预览)", category: "image" };
  }
  if (lower.endsWith(".bin")) {
    if (isImg) {
      return { label: "LVGL BIN", color: "#2563eb", desc: "LVGL 二进制位图 (直接解码预览)", category: "image" };
    }
    return { label: "BIN", color: "#64748b", desc: "通用二进制数据文件", category: "binary" };
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return { label: "JPEG", color: "#0891b2", desc: "JPEG 图像", category: "image" };
  }
  if (lower.endsWith(".webp")) {
    return { label: "WEBP", color: "#7c3aed", desc: "WebP 图像", category: "image" };
  }
  if (lower.endsWith(".lua")) {
    return { label: "LUA", color: "#059669", desc: "Lua 逻辑脚本文件", category: "lua" };
  }
  if (lower.endsWith(".json")) {
    return { label: "JSON", color: "#d97706", desc: "JSON 数据配置文件", category: "data" };
  }
  if (lower.endsWith(".xml")) {
    return { label: "XML", color: "#ea580c", desc: "XML 数据文件", category: "data" };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return { label: "TXT", color: "#475569", desc: "纯文本文件", category: "text" };
  }
  if (isText) {
    return { label: "TEXT", color: "#475569", desc: "文本数据文件", category: "text" };
  }
  const ext = path.split(".").pop()?.toUpperCase() || "FILE";
  return { label: ext, color: "#64748b", desc: `${ext} 格式文件`, category: "other" };
}

export interface AssetInspectorProps {
  project: WatchfaceProject;
  assetPath: string;
  projectDirectory?: FileSystemDirectoryHandle | null;
}

export const AssetInspector = memo(function AssetInspector({
  project,
  assetPath,
  projectDirectory,
}: AssetInspectorProps) {
  const asset = project.assets[assetPath];
  const removeAsset = useEditorStore((state) => state.removeAsset);
  const updateAssetContent = useEditorStore((state) => state.updateAssetContent);

  const [copied, setCopied] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [actualSizeView, setActualSizeView] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const isImg = asset ? isImageAsset(asset) : false;
  const isText = asset ? isTextAsset(assetPath, asset.blob) : false;
  const filename = assetPath.split("/").at(-1) ?? "";
  const typeBadge = useMemo(() => getAssetTypeBadge(assetPath, isImg, isText), [assetPath, isImg, isText]);

  const width = asset?.width || naturalSize?.width || 0;
  const height = asset?.height || naturalSize?.height || 0;
  const dimensionsStr = width && height ? `${width} × ${height}` : null;
  const aspectRatioStr = width && height ? getAspectRatio(width, height) : "";

  const normalizedText = useMemo(
    () => (textContent ? textContent.replace(/\r\n/g, "\n") : ""),
    [textContent],
  );
  const textLines = useMemo(
    () => (normalizedText ? normalizedText.split("\n") : []),
    [normalizedText],
  );

  // 异步载入文本内容
  useEffect(() => {
    if (!asset?.blob || !isText) {
      setTextContent(null);
      return;
    }
    setLoadingContent(true);
    asset.blob
      .text()
      .then((txt) => {
        setTextContent(txt);
        setLoadingContent(false);
      })
      .catch(() => {
        setTextContent(null);
        setLoadingContent(false);
      });
  }, [asset?.blob, isText]);

  // 引用追踪
  const references = useMemo(
    () => findAssetReferences(project, assetPath),
    [project, assetPath],
  );

  // 复制路径
  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`resources/${assetPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = `resources/${assetPath}`;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [assetPath]);

  // 复制完整文本或代码
  const handleCopyContent = useCallback(async () => {
    if (textContent === null) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = textContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 1500);
    }
  }, [textContent]);

  // 从弹窗大编辑器保存
  const handleSaveCode = useCallback(async (newContent: string) => {
    if (projectDirectory) {
      await writeResourceTextFile(projectDirectory, assetPath, newContent);
    }
    updateAssetContent(assetPath, newContent);
    setTextContent(newContent);
  }, [assetPath, projectDirectory, updateAssetContent]);


  // 永久删除文件
  const handleDeleteFile = useCallback(async () => {
    const ok = await dialogManager.confirm({
      title: "永久删除文件",
      message: `确定永久删除 resources/${assetPath}？此操作无法恢复。已引用该文件的资源可能会受到影响。`,
      confirmText: "永久删除",
      danger: true,
    });
    if (!ok) return;
    try {
      if (projectDirectory) {
        await deleteResourceFile(projectDirectory, assetPath);
      }
      removeAsset(assetPath);
    } catch (error) {
      void dialogManager.alert({ title: "永久删除文件失败", message: error instanceof Error ? error.message : "永久删除文件失败", type: "error" });
    }
  }, [assetPath, projectDirectory, removeAsset]);

  if (!asset) {
    return (
      <aside className="inspector panel-surface">
        <InspectorNavigation />
        <div className="inspector-body">
          <div className="empty-state-card">
            <FileText size={28} className="empty-state-icon" />
            <div className="empty-state-title">文件不存在</div>
            <div className="empty-state-desc">resources/{assetPath} 未在当前项目资源库中找到，可能已被删除或移除。</div>
          </div>
        </div>
      </aside>
    );
  }

  // 头部图标渲染（图片保留棋盘，非图片使用精致卡片无棋盘）
  const renderHeaderPreview = () => {
    if (isImg) {
      return (
        <div className="resource-preview asset-header-preview" title={dimensionsStr ? `尺寸: ${dimensionsStr}` : typeBadge.desc}>
          <img src={asset.url} alt={filename} className="asset-header-img" />
        </div>
      );
    }

    let icon = <File size={26} color={typeBadge.color} />;
    if (typeBadge.category === "lua") {
      icon = <FileCode size={26} color="#059669" />;
    } else if (typeBadge.category === "data") {
      icon = <Braces size={26} color="#d97706" />;
    } else if (typeBadge.category === "binary") {
      icon = <Binary size={26} color="#64748b" />;
    } else if (typeBadge.category === "text") {
      icon = <FileText size={26} color="#2563eb" />;
    }

    return (
      <div
        className="asset-header-non-img-box"
        style={{
          backgroundColor: `${typeBadge.color}15`,
          borderColor: `${typeBadge.color}35`,
        }}
        title={typeBadge.desc}
      >
        {icon}
        <span
          className="asset-header-non-img-tag"
          style={{ color: typeBadge.color, backgroundColor: `${typeBadge.color}22` }}
        >
          {typeBadge.label}
        </span>
      </div>
    );
  };

  return (
    <aside className="inspector panel-surface">
      <InspectorNavigation />
      <InspectorHeader
        preview={renderHeaderPreview()}
        name={filename}
        namePlaceholder="未命名文件"
        dimensions={isImg ? dimensionsStr : formatFileSizeKB(asset.blob.size)}
        dimensionsUnit={isImg ? undefined : ""}
        disabled
      />
      <AssetReferences references={references} />

      <div className="inspector-body">
        {/* 1. 内容预览区（切图 / 代码 / 十六进制转储） */}
        {isImg ? (
          <InspectorCard
            title="切图预览"
            icon={<Eye size={15} className="card-icon" />}
            badge={
              <span
                className="asset-type-badge-pill"
                style={{ backgroundColor: `${typeBadge.color}1f`, color: typeBadge.color }}
              >
                {typeBadge.label}
              </span>
            }
            headerExtra={
              <button
                type="button"
                className="asset-preview-toggle-size"
                onClick={(e) => {
                  e.stopPropagation();
                  setActualSizeView((prev) => !prev);
                }}
                title={actualSizeView ? "切换为自适应缩放" : "切换为 1:1 实际大小"}
              >
                {actualSizeView ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
                <span>{actualSizeView ? "自适应" : "实际尺寸"}</span>
              </button>
            }
          >
            <div className="asset-inspector-preview-box">
              <div className={`asset-inspector-preview-inner${actualSizeView ? " is-actual-size" : ""}`}>
                <img
                  src={asset.url}
                  alt={filename}
                  className="asset-inspector-img"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                />
              </div>

              {dimensionsStr ? (
                <div className="asset-preview-overlay-info">
                  <span className="asset-overlay-tag">{dimensionsStr} px</span>
                  {aspectRatioStr ? <span className="asset-overlay-tag">{aspectRatioStr}</span> : null}
                </div>
              ) : null}
            </div>
          </InspectorCard>
        ) : isText ? (
          <InspectorCard
            title={typeBadge.category === "lua" ? "Lua 脚本预览" : "文本数据预览"}
            icon={typeBadge.category === "lua" ? <FileCode size={15} className="card-icon" /> : <FileText size={15} className="card-icon" />}
            badge={
              <span
                className="asset-type-badge-pill"
                style={{ backgroundColor: `${typeBadge.color}1f`, color: typeBadge.color }}
              >
                {textContent !== null ? `${textLines.length} 行` : typeBadge.label}
              </span>
            }
            headerExtra={
              <div className="asset-code-header-actions">
                <button
                  type="button"
                  className="asset-code-action-btn is-edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditorOpen(true);
                  }}
                  title="在大窗口中编辑代码 (独立保存、撤销、重做)"
                >
                  <Edit3 size={12} />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  className="asset-code-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyContent();
                  }}
                  title="复制脚本完整内容"
                >
                  {copiedContent ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedContent ? "已复制" : "复制代码"}</span>
                </button>
              </div>
            }
          >
            <div className="asset-code-preview-container">
              {loadingContent ? (
                <div className="asset-code-loading">正在读取脚本内容...</div>
              ) : textContent !== null ? (
                <div className="asset-code-viewer">
                  <div className="asset-code-gutter" aria-hidden="true">
                    {textLines.map((_, idx) => (
                      <span key={idx} className="asset-code-line-num">{idx + 1}</span>
                    ))}
                  </div>
                  <pre className="asset-code-body">
                    <code>{normalizedText}</code>
                  </pre>
                </div>
              ) : (
                <div className="asset-code-empty">未能读取文本内容</div>
              )}
            </div>
          </InspectorCard>
        ) : null}

        {/* 2. 详细元数据 */}
        <InspectorCard
          title="文件信息"
          icon={<FileText size={15} className="card-icon" />}
        >
          <div className="asset-meta-table">
            <div className="asset-meta-row">
              <span className="asset-meta-label">相对路径</span>
              <div className="asset-meta-value-with-action">
                <span className="asset-meta-path-text" title={`resources/${assetPath}`}>resources/{assetPath}</span>
                <button
                  type="button"
                  className="asset-mini-action-btn"
                  onClick={handleCopyPath}
                  title="复制资源相对路径"
                >
                  {copied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                  <span>{copied ? "已复制" : "复制"}</span>
                </button>
              </div>
            </div>

            <div className="asset-meta-row">
              <span className="asset-meta-label">文件类型</span>
              <span className="asset-meta-value">{typeBadge.desc}</span>
            </div>

            <div className="asset-meta-row">
              <span className="asset-meta-label">文件大小</span>
              <span className="asset-meta-value">
                {isImg ? formatBytes(asset.blob.size) : formatFileSizeKB(asset.blob.size)}
              </span>
            </div>

            {isText && textContent !== null ? (
              <div className="asset-meta-row">
                <span className="asset-meta-label">代码行数</span>
                <span className="asset-meta-value">{textLines.length} 行</span>
              </div>
            ) : null}

            {isImg && width && height ? (
              <>
                <div className="asset-meta-row">
                  <span className="asset-meta-label">分辨率</span>
                  <span className="asset-meta-value">{width} × {height} 像素</span>
                </div>
                {aspectRatioStr ? (
                  <div className="asset-meta-row">
                    <span className="asset-meta-label">宽高比</span>
                    <span className="asset-meta-value">{aspectRatioStr}</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {asset.lastModified ? (
              <div className="asset-meta-row">
                <span className="asset-meta-label">修改时间</span>
                <span className="asset-meta-value">{formatDate(asset.lastModified)}</span>
              </div>
            ) : null}
          </div>
        </InspectorCard>

        {/* 3. 危险操作 */}
        <section className="inspector-danger-card">
          <button type="button" onClick={handleDeleteFile} title="从磁盘与资源库中永久删除此文件">
            <Trash2 size={15} /> 永久删除文件
          </button>
        </section>
      </div>

      {isText && textContent !== null ? (
        <CodeEditorDialog
          open={isEditorOpen}
          assetPath={assetPath}
          initialContent={normalizedText}
          onSave={handleSaveCode}
          onClose={() => setIsEditorOpen(false)}
        />
      ) : null}
    </aside>
  );
});
