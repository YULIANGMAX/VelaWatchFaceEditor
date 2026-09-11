import { useMemo, useState } from "react";
import {
  Activity,
  Check,
  FolderTree,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  collectProjectDataSources,
  metricValue,
} from "../core/metrics";
import { DATA_SOURCE_LABELS } from "../device-definition/dataSourceLabels";
import { useEditorStore } from "../store/editorStore";

interface MetricsDrawerProps {
  open: boolean;
  onClose: () => void;
}

// 分组归类全部数据源
const DATA_SOURCE_CATEGORIES: Array<{
  id: string;
  name: string;
  prefix: string[];
}> = [
  { id: "health", name: "健康与运动", prefix: ["health"] },
  { id: "time", name: "时间与日期", prefix: ["time", "date"] },
  { id: "weather", name: "天气与环境", prefix: ["weather"] },
  { id: "system", name: "系统状态", prefix: ["system", "misc"] },
];

export function MetricsDrawer({ open, onClose }: MetricsDrawerProps) {
  const project = useEditorStore((state) => state.project);
  const previewMetrics = useEditorStore((state) => state.previewMetrics);
  const setPreviewMetric = useEditorStore((state) => state.setPreviewMetric);
  const resetPreviewMetrics = useEditorStore((state) => state.resetPreviewMetrics);
  const navigateTo = useEditorStore((state) => state.navigateTo);

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("used");
  const [isExpanded, setIsExpanded] = useState(false);

  // 收集当前项目中实际使用的数据源
  const usedDataSources = useMemo(
    () => collectProjectDataSources(project),
    [project],
  );

  const usedSourceKeys = useMemo(
    () => new Set(usedDataSources.map((item) => item.source)),
    [usedDataSources],
  );

  // 所有已知数据源列表
  const allDataSources = useMemo(() => {
    return Object.entries(DATA_SOURCE_LABELS).map(([source, label]) => ({
      source,
      label,
    }));
  }, []);

  // 搜索与分类过滤
  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allDataSources;

    if (selectedCategory === "used") {
      list = allDataSources.filter((item) => usedSourceKeys.has(item.source));
    } else if (selectedCategory !== "all") {
      const cat = DATA_SOURCE_CATEGORIES.find((c) => c.id === selectedCategory);
      if (cat) {
        list = allDataSources.filter((item) =>
          cat.prefix.some((p) => item.source.startsWith(p)),
        );
      }
    }

    if (!q) return list;
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q),
    );
  }, [allDataSources, query, selectedCategory, usedSourceKeys]);

  // 自定义覆盖数量
  const overrideCount = Object.keys(previewMetrics).length;

  if (!open) return null;

  const now = new Date();

  return (
    <aside
      className={`metrics-floating-panel${isExpanded ? " is-expanded" : ""}`}
      role="region"
      aria-label="模拟数据调试面板"
    >
      <header className="modal-header metrics-drawer-header">
        <div className="metrics-drawer-title-wrap">
          <h2 id="metrics-drawer-title">模拟数据调试</h2>
          {overrideCount > 0 ? (
            <span className="metrics-override-badge">
              已修改 {overrideCount} 项
            </span>
          ) : null}
        </div>
        <div className="metrics-drawer-actions">
          {overrideCount > 0 ? (
            <button
              className="metrics-reset-all-btn"
              onClick={resetPreviewMetrics}
              title="清除所有自定义覆盖值，恢复默认自动计算"
            >
              <RotateCcw size={12} />
              <span>全部重置</span>
            </button>
          ) : null}
          <button
            className="icon-button"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? "收起为紧凑浮窗" : "展开为全览面板"}
            aria-label={isExpanded ? "收起为紧凑浮窗" : "展开为全览面板"}
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button className="icon-button" onClick={onClose} title="关闭模拟面板" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </header>

      {/* 搜索与分类 Tab */}
      <div className="metrics-filter-bar">
        <div className="metrics-search-box">
          <Search size={14} />
          <input
            type="text"
            value={query}
            placeholder="搜索数据源（如步数、心率、电量）..."
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button className="icon-button mini" onClick={() => setQuery("")} title="清空搜索">
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="metrics-category-tabs">
          <button
            className={`metrics-tab${selectedCategory === "used" ? " is-active" : ""}`}
            onClick={() => setSelectedCategory("used")}
          >
            项目已使用 ({usedDataSources.length})
          </button>
          <button
            className={`metrics-tab${selectedCategory === "all" ? " is-active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            全部数据源 ({allDataSources.length})
          </button>
          {DATA_SOURCE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`metrics-tab${selectedCategory === cat.id ? " is-active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 数据源列表 */}
      <div className="metrics-list-scroll">
        {selectedCategory === "used" && usedDataSources.length === 0 ? (
          <div className="metrics-empty-used">
            <SlidersHorizontal size={28} />
            <strong>当前项目未引用任何数据源</strong>
            <p>可切换到「全部数据源」为任意数据源配置模拟值，或在资源库中添加数据项。</p>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="metrics-empty-search">
            <span>未找到匹配的数据源</span>
          </div>
        ) : (
          <div className="metrics-items-grid">
            {filteredSources.map((item) => {
              const isUsed = usedSourceKeys.has(item.source);
              const usageInfo = usedDataSources.find((u) => u.source === item.source);
              const currentValue = previewMetrics[item.source];
              const isOverridden = currentValue !== undefined;
              const isSleep = item.source === "healthSleepDuration";
              const defaultVal = isSleep ? "452 分钟 (7.5h)" : metricValue(item.source, now);
              const displayVal = isSleep && currentValue !== undefined
                ? metricValue(item.source, now, previewMetrics)
                : undefined;

              return (
                <div
                  className={`metric-card${isOverridden ? " is-overridden" : ""}${isUsed ? " is-used-source" : ""}`}
                  key={item.source}
                >
                  <div className="metric-card-header">
                    <div className="metric-card-title-group">
                      <strong className="metric-card-label">
                        {item.label}
                        {displayVal !== undefined ? <span className="metric-derived-badge" title="系统换算后显示的值">显示为 {displayVal} 小时</span> : null}
                      </strong>
                      <code className="metric-card-code">{item.source}</code>
                    </div>
                    {isUsed ? (
                      <span className="metric-used-badge" title="当前项目已引用该数据源">
                        已使用 ({usageInfo?.count})
                      </span>
                    ) : null}
                  </div>

                  {usageInfo && usageInfo.resourceNames.length > 0 ? (
                    <div className="metric-usages-row">
                      <FolderTree size={11} />
                      <div className="metric-usages-tags">
                        {usageInfo.resourceNames.map((resName) => {
                          const res = project.resources.find(
                            (r) => (r.attrs.name || r.id) === resName,
                          );
                          return (
                            <button
                              key={resName}
                              type="button"
                              className="metric-usage-tag"
                              onClick={() => {
                                if (res) {
                                  navigateTo({ kind: "resource", resourceId: res.id });
                                }
                              }}
                              title={`定位到资源 @${resName}`}
                            >
                              @{resName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="metric-input-row">
                    <div className="metric-input-control">
                      <input
                        type="text"
                        value={currentValue ?? ""}
                        placeholder={`默认：${defaultVal}`}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPreviewMetric(
                            item.source,
                            val === ""
                              ? undefined
                              : Number.isFinite(Number(val))
                              ? Number(val)
                              : val,
                          );
                        }}
                      />
                    </div>
                    {isOverridden ? (
                      <button
                        className="metric-clear-btn"
                        onClick={() => setPreviewMetric(item.source, undefined)}
                        title="清除自定义，恢复默认计算"
                        aria-label="重置该项"
                      >
                        <RotateCcw size={13} />
                      </button>
                    ) : (
                      <span className="metric-default-indicator" title="当前使用系统默认计算值">
                        <Check size={13} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="metrics-drawer-footer">
        <Activity size={14} />
        <span>模拟值仅用于画布与组件预览，不会保存到 XML 文件。</span>
      </footer>
    </aside>
  );
}
