import { describe, expect, it } from "vitest";
import { resourceVisibleInPreview } from "./ResourceRenderer";

describe("资源预览可见性", () => {
  const celsius = {
    id: "celsius",
    type: "DataItemImageNumber" as const,
    attrs: { source: "weatherCurrentTemperature", renderRule: "hideWhenUnitMismatch" },
    children: [],
  };
  const fahrenheit = {
    id: "fahrenheit",
    type: "DataItemImageNumber" as const,
    attrs: { source: "weatherCurrentTemperatureFahrenheit", renderRule: "hideWhenUnitMismatch" },
    children: [],
  };
  const preview = { color: "", elapsedMs: 0, temperatureUnit: "celsius" as const, metrics: {} };

  it("温度单位不匹配的子项不参与 Widget 自动布局", () => {
    expect(resourceVisibleInPreview(celsius, new Date(0), preview)).toBe(true);
    expect(resourceVisibleInPreview(fahrenheit, new Date(0), preview)).toBe(false);
  });

  it("支持今日最高温、最低温等所有温度指标的单位互斥判定", () => {
    const maxTempC = {
      id: "maxTempC",
      type: "DataItemImageNumber" as const,
      attrs: { source: "weatherTodayTemperatureMax", renderRule: "hideWhenUnitMismatch" },
      children: [],
    };
    const maxTempF = {
      id: "maxTempF",
      type: "DataItemImageNumber" as const,
      attrs: { source: "weatherTodayTemperatureMaxFahrenheit", renderRule: "hideWhenUnitMismatch" },
      children: [],
    };
    expect(resourceVisibleInPreview(maxTempC, new Date(0), preview)).toBe(true);
    expect(resourceVisibleInPreview(maxTempF, new Date(0), preview)).toBe(false);

    const fahrPreview = { color: "", elapsedMs: 0, temperatureUnit: "fahrenheit" as const, metrics: {} };
    expect(resourceVisibleInPreview(maxTempC, new Date(0), fahrPreview)).toBe(false);
    expect(resourceVisibleInPreview(maxTempF, new Date(0), fahrPreview)).toBe(true);
  });

  it("hideWhenOutRange 在有区间时能根据指标判定出界与显隐", () => {
    const pointerInRange = {
      id: "pointer1",
      type: "DataItemPointer" as const,
      attrs: { source: "timeSecond", valueStart: "0", valueRange: "30", renderRule: "hideWhenOutRange" },
      children: [],
    };
    // 秒数 15 -> 在 [0, 30] 内
    const now15 = new Date(2026, 0, 1, 12, 0, 15);
    expect(resourceVisibleInPreview(pointerInRange, now15, preview)).toBe(true);
    // 秒数 45 -> 在 [0, 30] 外
    const now45 = new Date(2026, 0, 1, 12, 0, 45);
    expect(resourceVisibleInPreview(pointerInRange, now45, preview)).toBe(false);
  });

  it("数字组件无区间时设 hideWhenOutRange 优雅回退为显示", () => {
    const numOutRule = {
      id: "num1",
      type: "DataItemImageNumber" as const,
      attrs: { source: "systemStatusBattery", renderRule: "hideWhenOutRange" },
      children: [],
    };
    expect(resourceVisibleInPreview(numOutRule, new Date(0), preview)).toBe(true);
  });

  it("进度条组件设 hideWhenOutRange 时外层容器保持可见以渲染底轨", () => {
    const arcProgress = {
      id: "arc1",
      type: "DataItemArcProgressBar" as const,
      attrs: { source: "systemStatusBattery", valueStart: "0", valueRange: "5", renderRule: "hideWhenOutRange" },
      children: [],
    };
    // 即使电量超出 [0, 5]，外层也保持 true，由 ProgressRenderer 内部隐藏前景但保留底轨 bg
    expect(resourceVisibleInPreview(arcProgress, new Date(0), preview)).toBe(true);
  });
});
