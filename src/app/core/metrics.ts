import type { WatchfaceProject } from "./model";
import { DATA_SOURCE_LABELS } from "../device-definition/dataSourceLabels";

export interface ProjectDataSourceUsage {
  source: string;
  label: string;
  count: number;
  resourceNames: string[];
}

export function collectProjectDataSources(project: WatchfaceProject): ProjectDataSourceUsage[] {
  const usageMap = new Map<string, { count: number; resourceNames: Set<string> }>();

  const record = (source: string | undefined, resourceName: string) => {
    if (!source || !source.trim()) return;
    const key = source.trim();
    let entry = usageMap.get(key);
    if (!entry) {
      entry = { count: 0, resourceNames: new Set() };
      usageMap.set(key, entry);
    }
    entry.count += 1;
    if (resourceName) entry.resourceNames.add(resourceName);
  };

  for (const res of project.resources) {
    const resName = res.attrs.name || res.id;
    record(res.attrs.source, resName);
    record(res.attrs.valueStartSource, resName);
    record(res.attrs.valueRangeSource, resName);
    for (const child of res.children) {
      record(child.attrs.source, resName);
    }
  }

  return Array.from(usageMap.entries()).map(([source, { count, resourceNames }]) => ({
    source,
    label: DATA_SOURCE_LABELS[source] ?? source,
    count,
    resourceNames: Array.from(resourceNames),
  }));
}

export function metricValue(
  source: string | undefined,
  now = new Date(),
  overrides: Record<string, number | string> = {},
): number | string {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const centiSecond = Math.floor(now.getMilliseconds() / 10);
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  const week = now.getDay();
  const weekCN = ["日", "一", "二", "三", "四", "五", "六"][week];
  const weekEN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][week];
  const monthEN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1];
  const valuesWithCurrentTime: Record<string, number | string> = {
    timeHour: hour,
    timeHourHigh: Math.floor(hour / 10),
    timeHourLow: hour % 10,
    timeMinute: minute,
    timeMinuteHigh: Math.floor(minute / 10),
    timeMinuteLow: minute % 10,
    timeSecond: second,
    timeSecondHigh: Math.floor(second / 10),
    timeSecondLow: second % 10,
    timeCentiSecond: centiSecond,
    timeCentiSecondHigh: Math.floor(centiSecond / 10),
    timeCentiSecondLow: centiSecond % 10,
    timeHour12H: hour % 12 || 12,
    timeHour24H: hour,
    dateYear: year,
    dateYearDigit1: Math.floor(year / 1000) % 10,
    dateYearDigit2: Math.floor(year / 100) % 10,
    dateYearDigit3: Math.floor(year / 10) % 10,
    dateYearDigit4: year % 10,
    dateMonth: month,
    dateMonthHigh: Math.floor(month / 10),
    dateMonthLow: month % 10,
    dateDay: day,
    dateDayHigh: Math.floor(day / 10),
    dateDayLow: day % 10,
    dateWeek: week,
    dateWeekStringShortCN: `周${weekCN}`,
    dateWeekStringFullCN: `星期${weekCN}`,
    dateWeekStringFullPascalEN: weekEN,
    dateWeekStringFullUpperEN: weekEN.toUpperCase(),
    dateWeekStringFullLowerEN: weekEN.toLowerCase(),
    dateWeekStringShortPascalEN: weekEN.slice(0, 3),
    dateWeekStringShortUpperEN: weekEN.slice(0, 3).toUpperCase(),
    dateWeekStringShortLowerEN: weekEN.slice(0, 3).toLowerCase(),
    dateMonthStringShortCN: `${month}月`,
    dateMonthStringFullPascalEN: monthEN,
    dateMonthStringFullUpperEN: monthEN.toUpperCase(),
    dateMonthStringFullLowerEN: monthEN.toLowerCase(),
    dateMonthStringShortPascalEN: monthEN.slice(0, 3),
    dateMonthStringShortUpperEN: monthEN.slice(0, 3).toUpperCase(),
    dateMonthStringShortLowerEN: monthEN.slice(0, 3).toLowerCase(),
    miscIsAM: hour < 12 ? 1 : 0,
  };
  const values: Record<string, number | string> = {
    ...valuesWithCurrentTime,
    systemStatusBattery: 72,
    systemStatusBluetooth: 1,
    systemStatusDisturb: 0,
    systemStatusScreenLock: 1,
    healthHeartRate: 76,
    healthStepCount: 8432,
    healthStepKiloMeter: 5.32,
    healthCalorieValue: 386,
    healthCalorieProgress: 64,
    healthExerciseDuration: 34,
    healthExerciseProgress: 57,
    healthStandCount: 8,
    healthStandProgress: 66,
    healthStepProgress: 78,
    healthOxygenSpO2: 98,
    healthSleepDuration: 452,
    weatherCurrentTemperature: 26,
    weatherCurrentTemperatureFahrenheit: 79,
    weatherCurrentWeather: 1,
  };

  if (!source) return 0;
  let raw: number | string | undefined;
  if (source in overrides) raw = overrides[source];
  else if (source in values) raw = values[source];
  else if (/^[0-9a-fA-F]+$/.test(source)) raw = 42;
  else raw = 0;

  // 睡眠时长特殊处理：数据源底层单位为分钟，但表盘呈现时系统会自动转换为小时（如 452分->7.5小时，329分->5.5小时）
  if (source === "healthSleepDuration") {
    const minutes = Number(raw);
    if (Number.isFinite(minutes)) {
      return Math.round((minutes / 60) * 10) / 10;
    }
  }

  return raw;
}

export function numericMetric(source: string | undefined, now?: Date, overrides?: Record<string, number | string>): number {
  const value = metricValue(source, now, overrides);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
