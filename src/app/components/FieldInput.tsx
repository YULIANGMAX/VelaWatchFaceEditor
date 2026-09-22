import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Calculator, ChevronDown, ChevronRight, File, Folder, RefreshCw, Search, X } from "lucide-react";
import { RESOURCE_DEFINITION_MAP, type FieldDefinition } from "../editor/manifestEditorSchema";
import { generateWatchfaceId, getDeviceProfile, isPreviewResource, normalizePath, refName, type Attributes, type WatchfaceProject, type WatchfaceResource } from "../core/model";
import { getManifestAttributeAllowedValues } from "../device-definition";
import { getDataSourceValidationError } from "../core/validation";
import { DATA_SOURCE_LABELS } from "../device-definition/dataSourceLabels";
import { useEditorStore } from "../store/editorStore";
import { measureResource } from "../core/measure";
import { ResourceRenderer } from "./ResourceRenderer";

const THEME_TYPE_LABELS: Record<string, string> = { normal: "普通", AOD: "息屏" };

const JUMP_APP_LABELS: Record<string, string> = {
  pressure: "压力",
  breath: "呼吸放松",
  heartrate: "心率",
  sleep: "睡眠",
  SpO2: "血氧",
  sport: "运动",
  activities: "活动记录",
  media: "媒体控制",
  settings: "设置",
  compass: "指南针",
  flashlight: "手电筒",
  calendar: "日程",
  remoteCamera: "遥控拍照",
  sportsRecord: "运动记录",
  alipay: "支付宝",
  womenHealth: "女性健康",
  chronograph: "秒表",
  weather: "天气",
  phone: "电话",
  wxpay: "微信支付",
  timer: "倒计时",
  findPhone: "找设备",
  alarm: "闹钟",
  recorder: "录音机",
  barometer: "气压计",
  nfcCard: "NFC 卡",
  voiceAssistant: "语音助手",
  contact: "联系人",
  sportsCourse: "运动课程",
  temperature: "体温",
  share: "分享",
  bloodPressure: "血压",
  ECG: "心电图",
  vitalityValue: "活力值",
  jsApplication: "JavaScript 应用",
  luaApplication: "Lua 应用",
  trainingStatus: "训练状态",
  todo: "待办事项",
  miJia: "米家",
  glucose: "血糖",
  sms: "短信",
  worldclock: "世界时钟",
  perpetualcalendar: "日历",
  amap: "高德地图",
  intercom: "对讲",
  navigation: "导航",
  research: "研究",
  wechat: "微信",
};

interface FieldInputProps {
  field: FieldDefinition;
  value: string;
  project: WatchfaceProject;
  onChange: (value: string) => void;
  disabled?: boolean;
  target?: string;
  placeholder?: string;
  computableValue?: number | string;
  resourceAttrs?: Attributes;
}

interface AssetPathSelectProps {
  field: FieldDefinition;
  value: string;
  project: WatchfaceProject;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

interface AssetEntry {
  path: string;
  file: string;
  folder: string;
}

export interface ComboboxOption {
  value: string;
  label?: string;
  detail?: string;
  preview?: ReactNode;
}

interface ComboboxInputProps {
  id?: string;
  value: string;
  options: ComboboxOption[] | (() => ComboboxOption[]);
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function ComboboxInput({ id, value, options, placeholder, disabled = false, onChange }: ComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const resolvedOptions = useMemo(() => {
    if (!open) return [];
    return typeof options === "function" ? options() : options;
  }, [open, options]);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? resolvedOptions.filter((option) =>
        (option.label ?? option.value).toLowerCase().includes(query)
        || option.detail?.toLowerCase().includes(query)
      )
    : resolvedOptions;
  const displayOptions = (filtered.length > 0 || !query) ? filtered : resolvedOptions;

  return (
    <div className={`combobox${open ? " is-open" : ""}`} ref={rootRef}>
      <input
        id={id}
        ref={inputRef}
        className="combobox-input"
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="combobox-toggle"
        tabIndex={-1}
        aria-label="展开选项"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="combobox-popup" role="listbox">
          {resolvedOptions.length === 0 ? (
            <div className="combobox-empty">暂无可用引用资源</div>
          ) : displayOptions.length === 0 ? (
            <div className="combobox-empty">无匹配选项</div>
          ) : (
            displayOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`combobox-option${option.preview ? " has-preview" : ""}${option.value === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.preview ? <span className="combobox-option-preview">{option.preview}</span> : null}
                <span className="combobox-option-label">{option.label ?? option.value}</span>
                {option.detail ? <span className="combobox-option-detail">{option.detail}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 资源引用下拉项的统一静态缩略预览。 */
const ResourceReferenceThumbnail = memo(function ResourceReferenceThumbnail({ project, resource }: { project: WatchfaceProject; resource: WatchfaceResource }) {
  const previewColor = useEditorStore((state) => state.previewColor);
  const previewTemperatureUnit = useEditorStore((state) => state.previewTemperatureUnit);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const colors = (project.watchface.colorGroupTable || project.watchface.recolorTable || "")
    .split(",").map((color) => color.trim()).filter(Boolean);
  const color = colors.includes(previewColor) ? previewColor : colors[0] ?? "";
  const dimensions = measureResource(project, resource, color);
  const width = dimensions.width || Number(resource.attrs.w) || 32;
  const height = dimensions.height || Number(resource.attrs.h) || 32;
  const scale = Math.min(1, 28 / width, 28 / height);
  const offsetX = (28 - width * scale) / 2;
  const offsetY = (28 - height * scale) / 2;

  return (
    <span className="resource-reference-thumb">
      <span className="resource-reference-thumb-renderer" style={{ left: offsetX, top: offsetY, transform: `scale(${scale})` }}>
        <ResourceRenderer
          project={project}
          resource={resource}
          resourceName={resource.attrs.name || resource.id}
          now={new Date()}
          preview={{ color, elapsedMs: 0, temperatureUnit: previewTemperatureUnit, metrics: previewMetrics }}
          frameIndex={0}
        />
      </span>
    </span>
  );
});

interface ResourceReferenceSelectProps {
  id?: string;
  value: string;
  project: WatchfaceProject;
  resources: WatchfaceResource[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** 资源属性与组合子项共用的引用选择器。 */
export function ResourceReferenceSelect({ id, value, project, resources, disabled = false, onChange }: ResourceReferenceSelectProps) {
  const getOptions = useCallback((): ComboboxOption[] => {
    const validResources = resources.filter((resource) => !isPreviewResource(resource));
    const options: ComboboxOption[] = validResources.map((resource) => ({
      value: `@${resource.attrs.name}`,
      label: `@${resource.attrs.name}`,
      detail: `${RESOURCE_DEFINITION_MAP[resource.type]?.group ?? "基础"}组件 · ${RESOURCE_DEFINITION_MAP[resource.type]?.label || resource.type}`,
      preview: <ResourceReferenceThumbnail project={project} resource={resource} />,
    }));
    if (value && !options.some((option) => option.value === value)) {
      options.unshift({ value, label: value, detail: "引用无效" });
    }
    return options;
  }, [project, resources, value]);

  return <ComboboxInput id={id} value={value} options={getOptions} disabled={disabled} placeholder="未设置" onChange={onChange} />;
}

interface AssetFolderNode {
  name: string;
  path: string; // 相对 resources/ 的完整路径
  folders: AssetFolderNode[];
  files: AssetEntry[];
}

export function AssetPathSelect({ field, value, project, onChange, disabled = false, id }: AssetPathSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isImagePath = (path: string) => /\.png$/i.test(path);
  const entries: AssetEntry[] = Object.keys(project.assets)
    .filter((path) => field.assetType !== "image" || isImagePath(path))
    .map((path) => {
      const index = path.lastIndexOf("/");
      return {
        path,
        file: index === -1 ? path : path.slice(index + 1),
        folder: index === -1 ? "" : path.slice(0, index),
      };
    });

  // 构建目录树：根目录 → 子目录（按名称自然排序）→ 文件（按名称自然排序）
  const buildTree = (): AssetFolderNode => {
    const root: AssetFolderNode = { name: "resources", path: "", folders: [], files: [] };
    for (const entry of entries) {
      let node = root;
      let currentPath = "";
      for (const part of entry.folder.split("/")) {
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let child = node.folders.find((folder) => folder.name === part);
        if (!child) {
          child = { name: part, path: currentPath, folders: [], files: [] };
          node.folders.push(child);
        }
        node = child;
      }
      node.files.push(entry);
    }
    const sortNode = (node: AssetFolderNode) => {
      node.folders.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
      node.files.sort((left, right) => left.file.localeCompare(right.file, undefined, { numeric: true, sensitivity: "base" }));
      node.folders.forEach(sortNode);
    };
    sortNode(root);
    return root;
  };

  const tree = buildTree();
  const normalizedFilter = filter.trim().toLowerCase();
  const matchesFilter = (entry: AssetEntry) => !normalizedFilter
    || entry.file.toLowerCase().includes(normalizedFilter)
    || entry.path.toLowerCase().includes(normalizedFilter);
  const nodeHasMatch = (node: AssetFolderNode): boolean => node.files.some(matchesFilter) || node.folders.some(nodeHasMatch);
  const expandSelectedPath = () => {
    const selectedFolder = selected?.folder;
    if (!selectedFolder) return;
    const parts = selectedFolder.split("/");
    setExpandedFolders((current) => {
      const next = new Set(current);
      for (let index = 1; index <= parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
      return next;
    });
  };

  const selected = entries.find((entry) => entry.path === value);
  const thumbOf = (entry: AssetEntry) => {
    if (!isImagePath(entry.path)) {
      return <span className="asset-picker-thumb asset-picker-thumb-empty"><File size={13} /></span>;
    }
    const url = project.assets[entry.path]?.url;
    return url
      ? <span className="asset-picker-thumb"><img src={url} alt="" /></span>
      : <span className="asset-picker-thumb asset-picker-thumb-empty" />;
  };

  return (
    <div className="asset-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`asset-picker-trigger${value ? " has-value" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => {
          const next = !current;
          if (next) expandSelectedPath();
          return next;
        })}
      >
        {selected ? (
          <>
            {thumbOf(selected)}
            <span className="asset-picker-value" title={selected.path}>{selected.file}</span>
          </>
        ) : value ? (
          <span className="asset-picker-value asset-picker-missing" title={value}>{value}（文件不存在）</span>
        ) : (
          <span className="asset-picker-value asset-picker-placeholder">请选择文件</span>
        )}
        <ChevronDown className="asset-picker-caret" size={15} />
      </button>
      {open ? (
        <div className="asset-picker-popup" role="listbox">
          <label className="asset-picker-filter">
            <Search size={14} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选文件名或路径" autoFocus />
            {filter ? <button type="button" onClick={() => setFilter("")} title="清除筛选"><X size={13} /></button> : null}
          </label>
          <div className="asset-picker-results">
            {(() => {
              const renderFolder = (node: AssetFolderNode, depth: number): ReactNode => {
                if (!nodeHasMatch(node)) return null;
                const root = node.path === "";
                const expanded = root || Boolean(normalizedFilter) || expandedFolders.has(node.path);
                return (
                  <div key={node.path || "root"}>
                    {root ? <div className="asset-picker-group-label"><Folder size={14} /><span className="asset-picker-group-path">resources/</span></div> : (
                      <button
                        type="button"
                        className="asset-picker-group-label asset-picker-folder-toggle"
                        style={{ paddingLeft: 8 + depth * 14 }}
                        onClick={() => setExpandedFolders((current) => {
                          const next = new Set(current);
                          if (next.has(node.path)) next.delete(node.path);
                          else next.add(node.path);
                          return next;
                        })}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Folder size={14} />
                        <span className="asset-picker-group-path">{node.name}</span>
                      </button>
                    )}
                    {expanded ? <>
                      {node.folders.map((child) => renderFolder(child, depth + 1))}
                      {node.files.filter(matchesFilter).map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          role="option"
                          aria-selected={entry.path === value}
                          className={`asset-picker-option${entry.path === value ? " is-selected" : ""}`}
                          style={{ paddingLeft: 24 + depth * 14 }}
                          onClick={() => { onChange(entry.path); setOpen(false); }}
                        >
                          {thumbOf(entry)}
                          <span className="asset-picker-file" title={entry.path}>{entry.file}</span>
                        </button>
                      ))}
                    </> : null}
                  </div>
                );
              };
              return nodeHasMatch(tree) ? renderFolder(tree, 0) : <div className="asset-picker-empty">无匹配文件</div>;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MouseTooltip({ text, x, y }: { text: string; x: number; y: number }) {
  if (typeof document === "undefined") return null;
  const gap = 14;
  // 当光标右侧空间不足时翻转至左侧显示
  const isFlipX = x + gap + 220 > window.innerWidth;
  // 当光标下方空间不足时翻转至上方显示
  const isFlipY = y + 16 + 70 > window.innerHeight;

  const style: React.CSSProperties = {
    maxWidth: isFlipX
      ? `${Math.min(250, Math.max(120, x - gap - 16))}px`
      : `${Math.min(250, Math.max(120, window.innerWidth - x - gap - 16))}px`,
  };

  if (isFlipX) {
    // 翻到左侧时：通过定位 right 让气泡右边缘紧贴光标左侧 gap，无论气泡实际多宽都不会远离光标
    style.right = `${Math.max(8, window.innerWidth - x + gap)}px`;
  } else {
    // 正常在右侧时：气泡左边缘紧贴光标右侧 gap
    style.left = `${x + gap}px`;
  }

  if (isFlipY) {
    // 翻到上方时：通过定位 bottom 让气泡下边缘紧贴光标上方 12px，无论几行文字都不遮挡且紧凑
    style.bottom = `${Math.max(8, window.innerHeight - y + 12)}px`;
  } else {
    // 正常在下方时：气泡上边缘紧贴光标下方 16px
    style.top = `${y + 16}px`;
  }

  return createPortal(
    <div className="field-floating-tooltip" style={style}>
      {text}
    </div>,
    document.body,
  );
}

export function FieldInput({
  field,
  value,
  project,
  onChange,
  disabled = false,
  target,
  placeholder: customPlaceholder,
  computableValue,
  resourceAttrs,
}: FieldInputProps) {
  const navigateTo = useEditorStore((state) => state.navigateTo);
  disabled = disabled || Boolean(field.readOnly);
  const allowedValues = target ? getManifestAttributeAllowedValues(project.device, target, field.key) : undefined;
  const id = `field-${field.key}`;
  const previewNote = field.previewSupport === "device"
    ? "需设备支持"
    : field.previewSupport === "partial"
      ? "可能与真机存在差异"
      : "";
  const helpText = [field.help, previewNote].filter(Boolean).join(" · ");
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (helpText) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseLeave = () => {
    if (mousePos) setMousePos(null);
  };

  if (field.kind === "boolean") {
    const nextValue = value === "true" ? "false" : "true";
    let recolorBlocked = false;
    let recolorBlockedReason: string | null = null;

    if (nextValue === "true") {
      const hasRecolorTable = Boolean(project.watchface.recolorTable?.trim());
      if (field.key === "recolorEnable") {
        if (!hasRecolorTable) {
          recolorBlocked = true;
          recolorBlockedReason = "需先在表盘配置「动态颜色表」";
        }
      } else if (field.key === "supportRecolor") {
        if (!hasRecolorTable) {
          recolorBlocked = true;
          recolorBlockedReason = "需先在表盘配置「动态颜色表」";
        } else if (!resourceAttrs?.ref?.trim()) {
          recolorBlocked = true;
          recolorBlockedReason = "需先指定引用素材";
        } else {
          const targetName = resourceAttrs.ref.replace(/^@/, "");
          const targetResource = project.resources.find((r) => r.attrs.name === targetName);
          if (!targetResource || targetResource.attrs.recolorEnable !== "true") {
            recolorBlocked = true;
            recolorBlockedReason = "引用素材未开启允许换色";
          }
        }
      }
    }

    const nextValueBlocked = Boolean(allowedValues && !allowedValues.includes(nextValue)) || recolorBlocked;
    const blockedReason = recolorBlocked
      ? recolorBlockedReason
      : allowedValues && !allowedValues.includes(nextValue)
        ? `未验证值 ${nextValue}`
        : null;
    return (
      <div
        className={`field-row${disabled || nextValueBlocked ? " is-disabled" : ""}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <label className="field-row-label" htmlFor={id}>
          <span className="field-label-text">
            {field.label}
            {field.required ? <b className="field-required">*</b> : null}
          </span>
        </label>
        <div className="field-row-control field-row-switch">
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={value === "true"}
            className={`toggle${value === "true" ? " is-on" : ""}`}
            disabled={disabled || nextValueBlocked}
            onClick={() => onChange(value === "true" ? "false" : "true")}
          >
            <span />
          </button>
          {blockedReason ? <small className="field-error-inline">{blockedReason}</small> : null}
        </div>
        {mousePos && helpText ? <MouseTooltip text={helpText} x={mousePos.x} y={mousePos.y} /> : null}
      </div>
    );
  }

  const input = (() => {
    if (field.kind === "select") {
      const options = field.options?.filter((option) => !allowedValues || allowedValues.includes(option));
      const known = options?.includes(value) ?? false;
      const optionLabel = (option: string) => (options?.includes("AOD") ? THEME_TYPE_LABELS[option] ?? option : option);
      if (field.key === "jumpApp") {
        return (
          <ComboboxInput
            id={id}
            value={value}
            options={(options ?? []).map((option) => ({
              value: option,
              label: JUMP_APP_LABELS[option] ?? option,
              detail: option,
            }))}
            disabled={disabled}
            placeholder="输入或选择启动应用"
            onChange={onChange}
          />
        );
      }
      return (
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {!field.required ? <option value="">未设置</option> : null}
          {value && !known ? <option value={value}>{value}（非预设值）</option> : null}
          {options?.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
        </select>
      );
    }

    if (allowedValues) {
      return (
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {!field.required ? <option value="">未设置</option> : null}
          {value && !allowedValues.includes(value) ? <option value={value}>{value}（设备未验证）</option> : null}
          {allowedValues.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }

    if (field.kind === "reference") {
      const isWidgetArtwork = target === "Widget" && (field.key === "editBox" || field.key === "preview");
      const resources = project.resources.filter((resource) =>
        !isPreviewResource(resource)
        && (!field.referenceTypes || field.referenceTypes.includes(resource.type))
        && (!isWidgetArtwork || (resource.type === "Image" && normalizePath(resource.attrs.src ?? "").startsWith("_widget/")))
      );
      const targetResourceName = refName(value);
      const targetResource = targetResourceName
        ? project.resources.find((r) => r.attrs.name === targetResourceName)
        : undefined;

      return (
        <div className="reference-field-wrap">
          <ResourceReferenceSelect id={id} value={value} project={project} resources={resources} disabled={disabled} onChange={onChange} />
          {targetResource ? (
            <button
              type="button"
              className="child-jump-btn"
              onClick={() => navigateTo({ kind: "resource", resourceId: targetResource.id })}
              title={`跳转到引用的资源 @${targetResource.attrs.name}（${RESOURCE_DEFINITION_MAP[targetResource.type]?.label || targetResource.type}）`}
            >
              <ArrowUpRight size={14} />
            </button>
          ) : null}
        </div>
      );
    }

    if (field.kind === "textOrReference") {
      const references = project.resources.filter((resource) =>
        !isPreviewResource(resource) && (!field.referenceTypes || field.referenceTypes.includes(resource.type))
      );
      const options = references.map((resource) => {
        const name = `@${resource.attrs.name}`;
        const previewItem = resource.children?.find((c) => c.attrs.str)?.attrs.str;
        return {
          value: name,
          label: name,
          detail: previewItem
            ? `${RESOURCE_DEFINITION_MAP[resource.type]?.label || resource.type} · ${previewItem}`
            : (RESOURCE_DEFINITION_MAP[resource.type]?.label || resource.type),
        };
      });
      return (
        <ComboboxInput
          id={id}
          value={value}
          options={options}
          disabled={disabled}
          placeholder={field.required ? "必填" : "输入文本或选择多语言引用"}
          onChange={onChange}
        />
      );
    }

    if (field.kind === "dataSource") {
      const sources = getDeviceProfile(project.device).dataSources.codes;
      const options = Object.entries(sources).map(([name, code]) => ({ value: name, label: DATA_SOURCE_LABELS[name] ?? name, detail: `${name} · ${code}` }));
      const error = getDataSourceValidationError(project.device, value, field.key);
      return (
        <div className={`data-source-input${error ? " has-error" : ""}`}>
          <ComboboxInput
            id={id}
            value={value}
            options={options}
            disabled={disabled}
            placeholder={field.required ? "必填" : "输入或选择数据源"}
            onChange={onChange}
          />
          {error ? <small className="field-error-inline">{error.message}</small> : null}
        </div>
      );
    }

    if (field.kind === "colorGroup") {
      const colors = (project.watchface.colorGroupTable ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
      const noColors = colors.length === 0;
      return (
        <select id={id} value={value} disabled={disabled || noColors} onChange={(event) => onChange(event.target.value)}>
          <option value="">{noColors ? "未配置颜色组表" : "所有配色方案"}</option>
          {value && !colors.includes(value) ? <option value={value}>{value}（不在颜色组表中）</option> : null}
          {colors.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
      );
    }

    if (field.kind === "asset") {
      return <AssetPathSelect id={id} field={field} value={value} project={project} disabled={disabled} onChange={onChange} />;
    }

    const placeholderText = customPlaceholder || (field.required ? "必填" : "未设置");

    return (
      <div className={field.kind === "color" ? "color-input-wrap" : (field.action || computableValue !== undefined) ? "input-action-wrap" : undefined}>
        {field.kind === "color" ? (
          <input
            className="color-swatch"
            type="color"
            disabled={disabled}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}
        <input
          id={id}
          type={field.kind === "number" ? "number" : "text"}
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={placeholderText}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {computableValue !== undefined ? (
          <button
            type="button"
            className="input-action-button"
            title={`点击计算并填入尺寸（当前计算值: ${computableValue}）`}
            aria-label="计算尺寸"
            disabled={disabled}
            onClick={() => onChange(String(computableValue))}
          >
            <Calculator size={13} />
          </button>
        ) : null}
        {field.action === "generateWatchfaceId" ? (
          <button
            type="button"
            className="input-action-button"
            title="生成新表盘 ID"
            aria-label="生成新表盘 ID"
            disabled={disabled}
            onClick={() => onChange(generateWatchfaceId())}
          >
            <RefreshCw size={14} />
          </button>
        ) : null}
      </div>
    );
  })();

  return (
    <div
      className={`field-row${disabled ? " is-disabled" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <label className="field-row-label" htmlFor={id}>
        <span className="field-label-text">
          {field.label}
          {field.required ? <b className="field-required">*</b> : null}
        </span>
      </label>
      <div className="field-row-control">
        {input}
        {disabled ? <small className="field-error-inline">当前设备定义不允许编辑此属性。</small> : null}
      </div>
      {mousePos && helpText ? <MouseTooltip text={helpText} x={mousePos.x} y={mousePos.y} /> : null}
    </div>
  );
}
