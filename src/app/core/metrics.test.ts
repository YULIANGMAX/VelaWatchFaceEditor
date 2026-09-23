import { describe, expect, it } from "vitest";
import { collectProjectDataSources, metricValue } from "./metrics";
import { createBlankProject } from "./model";

describe("metrics 模块测试", () => {
  it("正确从项目中提取使用的数据源及其引用组件", () => {
    const project = createBlankProject();
    project.resources.push(
      {
        id: "res1",
        type: "DataItemText",
        attrs: { name: "StepText", source: "healthStepCount" },
        children: [],
      },
      {
        id: "res2",
        type: "DataItemArcProgressBar",
        attrs: { name: "HrArc", source: "healthHeartRate", valueStartSource: "healthHeartRateMin" },
        children: [],
      },
      {
        id: "res3",
        type: "DataItemImageValues",
        attrs: { name: "HrNum", source: "healthHeartRate" },
        children: [],
      },
    );

    const usages = collectProjectDataSources(project);
    expect(usages).toHaveLength(3);

    const hrUsage = usages.find((u) => u.source === "healthHeartRate");
    expect(hrUsage).toBeDefined();
    expect(hrUsage?.count).toBe(2);
    expect(hrUsage?.label).toBe("心率");
    expect(hrUsage?.resourceNames).toContain("HrArc");
    expect(hrUsage?.resourceNames).toContain("HrNum");

    const stepUsage = usages.find((u) => u.source === "healthStepCount");
    expect(stepUsage).toBeDefined();
    expect(stepUsage?.count).toBe(1);
    expect(stepUsage?.label).toBe("步数");

    const hrMinUsage = usages.find((u) => u.source === "healthHeartRateMin");
    expect(hrMinUsage).toBeDefined();
    expect(hrMinUsage?.count).toBe(1);
  });

  it("metricValue 正确返回默认值或自定义覆盖值", () => {
    const now = new Date(2026, 7, 27, 14, 30, 15, 670);
    expect(metricValue("timeHour", now)).toBe(14);
    expect(metricValue("timeMinute", now)).toBe(30);
    expect(metricValue("timeSecondHigh", now)).toBe(1);
    expect(metricValue("timeCentiSecond", now)).toBe(67);
    expect(metricValue("timeHour12H", now)).toBe(2);
    expect(metricValue("dateYear", now)).toBe(2026);
    expect(metricValue("dateMonthLow", now)).toBe(8);
    expect(metricValue("dateDayHigh", now)).toBe(2);
    expect(metricValue("dateWeekStringFullCN", now)).toBe("星期四");
    expect(metricValue("dateMonthStringShortUpperEN", now)).toBe("AUG");
    expect(metricValue("healthHeartRate", now)).toBe(76);

    // 只有显式设置模拟值时才覆盖当前时间／日期默认值。
    const overrides = { healthHeartRate: 155, timeHour: 8, dateWeekStringFullCN: "自定义星期" };
    expect(metricValue("healthHeartRate", now, overrides)).toBe(155);
    expect(metricValue("timeHour", now, overrides)).toBe(8);
    expect(metricValue("dateWeekStringFullCN", now, overrides)).toBe("自定义星期");
  });

  it("metricValue 对 healthSleepDuration 自动将分钟转换为小时（一位小数）", () => {
    // 默认 452 分钟 -> 7.5 小时
    expect(metricValue("healthSleepDuration")).toBe(7.5);

    // 自定义 329 分钟 -> 5.5 小时
    expect(metricValue("healthSleepDuration", undefined, { healthSleepDuration: 329 })).toBe(5.5);

    // 自定义 480 分钟 (整8小时) -> 8
    expect(metricValue("healthSleepDuration", undefined, { healthSleepDuration: 480 })).toBe(8);
  });

});
