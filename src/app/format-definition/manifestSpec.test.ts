import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifestSpecJson from "./manifest-spec.json";
import {
  FORMAT_RESOURCE_DEFINITIONS,
  FORMAT_RESOURCE_DEFINITION_MAP,
  loadManifestSpec,
} from "./manifestFormat";
import { SEMANTIC_RULES } from "../core/semanticRules";

describe("manifest.xml 声明式格式规范", () => {
  it("纯格式模块不依赖设备、编辑器或编译器", () => {
    const source = readFileSync(resolve(process.cwd(), "app/format-definition/manifestFormat.ts"), "utf8");
    expect(source).not.toMatch(/(?:device-definition|editor|compiler|core\/schema)/);
  });

  it("编译模块不依赖编辑模块", () => {
    const compilerDirectory = resolve(process.cwd(), "app/core/compiler");
    const sources = readdirSync(compilerDirectory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(resolve(compilerDirectory, name), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/(?:\/editor\/|core\/schema|\.\.\/\.\.\/editor)/);
  });

  it("JSON 是运行时资源定义的唯一来源", () => {
    expect(FORMAT_RESOURCE_DEFINITIONS.map((definition) => definition.type))
      .toEqual(manifestSpecJson.structure.resources.resourceTypes);
    expect(Object.keys(FORMAT_RESOURCE_DEFINITION_MAP)).toEqual(manifestSpecJson.structure.resources.resourceTypes);
    expect(manifestSpecJson).not.toHaveProperty("descriptionFields");
    expect(manifestSpecJson).not.toHaveProperty("editor");
    const serialized = JSON.stringify(manifestSpecJson);
    for (const editorKey of ["label", "group", "description", "control", "help", "section", "previewSupport", "action", "step"]) {
      expect(serialized).not.toContain(`"${editorKey}":`);
    }
  });

  it("通用刷新属性只声明 parameter", () => {
    for (const definition of FORMAT_RESOURCE_DEFINITIONS.filter((entry) => entry.type.startsWith("DataItem"))) {
      const keys = definition.fields.map((field) => field.key);
      expect(keys).toContain("parameter");
      expect(keys).not.toContain("param");
    }
  });

  it("数据资源默认写入刷新周期，并为支持换色资源固定 false", () => {
    const dataResources = FORMAT_RESOURCE_DEFINITIONS.filter((entry) => entry.type.startsWith("DataItem"));
    expect(dataResources.every((entry) => entry.defaults.parameter === "1000")).toBe(true);
    for (const type of ["DataItemImageNumber", "DataItemImageValues", "DataItemPointer", "DataItemArcProgressBar", "DataItemLineProgressBar"] as const) {
      expect(FORMAT_RESOURCE_DEFINITION_MAP[type].defaults.supportRecolor).toBe("false");
    }
  });

  it("系统文本只通过 Content 声明数据源，压缩方式使用标准大小写", () => {
    const textKeys = FORMAT_RESOURCE_DEFINITION_MAP.DataItemText.fields.map((field) => field.key);
    expect(textKeys).not.toContain("source");
    expect(textKeys).not.toContain("renderRule");
    expect(manifestSpecJson.structure.root.fields.find((field) => field.key === "compressMethod")?.enum)
      .toEqual(["RLEReversed", "None"]);
  });

  it("不为不支持对齐的图片资源声明 align", () => {
    for (const type of ["DataItemImageValues", "DataItemPointer", "DataItemArcProgressBar", "DataItemLineProgressBar"] as const) {
      expect(FORMAT_RESOURCE_DEFINITION_MAP[type].fields.map((field) => field.key)).not.toContain("align");
    }
  });

  it("Widget 的宽高可由内容推导，无需显式填写", () => {
    const fields = FORMAT_RESOURCE_DEFINITION_MAP.Widget.fields;
    expect(fields.find((field) => field.key === "w")?.required).not.toBe(true);
    expect(fields.find((field) => field.key === "h")?.required).not.toBe(true);
  });

  it("规范加载器拒绝重复资源类型和未知引用类型", () => {
    const duplicate = structuredClone(manifestSpecJson) as unknown as {
      resources: unknown[];
    };
    duplicate.resources.push(structuredClone(duplicate.resources[0]!));
    expect(() => loadManifestSpec(duplicate)).toThrow("资源类型重复");

    const unknownReference = structuredClone(manifestSpecJson) as unknown as {
      resources: Array<{ fields: Array<Record<string, unknown>> }>;
    };
    unknownReference.resources[0]!.fields.push({
      key: "badRef",
      type: "reference",
      referenceTypes: ["MissingType"],
    });
    expect(() => loadManifestSpec(unknownReference)).toThrow("未知资源类型 MissingType");
  });

  it("跨字段约束由语义规则文件注册", () => {
    expect(SEMANTIC_RULES.map((rule) => rule.code)).toEqual(expect.arrayContaining([
      "conflicting-color-tables",
      "missing-text-source",
      "invalid-decimal-digits",
      "slot-children-not-applicable",
    ]));
  });
});
