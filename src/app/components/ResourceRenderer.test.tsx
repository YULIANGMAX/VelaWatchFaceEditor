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
});
