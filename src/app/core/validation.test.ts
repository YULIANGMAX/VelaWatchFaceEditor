import { describe, expect, it } from "vitest";
import { getDataSourceValidationError, sortDiagnostics } from "./validation";
import { createBlankProject, type Diagnostic } from "./model";

describe("validation helpers", () => {
  const defaultDevice = createBlankProject().device;

  describe("getDataSourceValidationError", () => {
    it("returns null for empty value", () => {
      expect(getDataSourceValidationError(defaultDevice, "")).toBeNull();
    });

    it("identifies unknown data source names matching error list pattern", () => {
      expect(getDataSourceValidationError(defaultDevice, "timeYear")).toEqual({
        code: "unknown-data-source",
        message: "未知数据源 timeYear",
      });
      expect(getDataSourceValidationError(defaultDevice, "fakeSource")).toEqual({
        code: "unknown-data-source",
        message: "未知数据源 fakeSource",
      });
    });

    it("identifies odd-length hexadecimal codes", () => {
      expect(getDataSourceValidationError(defaultDevice, "123")).toEqual({
        code: "odd-length-data-source",
        message: "source 的十六进制代码必须为偶数长度",
      });
    });

    it("identifies invalid data source patterns", () => {
      expect(getDataSourceValidationError(defaultDevice, "bad-name!")).toEqual({
        code: "invalid-data-source",
        message: "source 必须为指标名称或不带 0x 的十六进制代码",
      });
    });

    it("accepts valid and supported data source", () => {
      expect(getDataSourceValidationError(defaultDevice, "dateYear")).toBeNull();
      expect(getDataSourceValidationError(defaultDevice, "0812")).toBeNull();
    });
  });

  describe("sortDiagnostics", () => {
    it("sorts diagnostics strictly by error > warning > info", () => {
      const input: Diagnostic[] = [
        { id: "1", severity: "info", code: "unused-asset", message: "提示1", location: "项目文件" },
        { id: "2", severity: "warning", code: "missing-theme-preview", message: "警告1", location: "Theme" },
        { id: "3", severity: "error", code: "unknown-data-source", message: "错误1", location: "Text" },
        { id: "4", severity: "info", code: "indexed8-color-check", message: "提示2", location: "Image" },
        { id: "5", severity: "error", code: "duplicate-name", message: "错误2", location: "Resources" },
      ];

      const sorted = sortDiagnostics(input);
      expect(sorted.map((item) => item.severity)).toEqual([
        "error",
        "error",
        "warning",
        "info",
        "info",
      ]);
      expect(sorted.map((item) => item.id)).toEqual(["3", "5", "2", "1", "4"]);
    });
  });
});
