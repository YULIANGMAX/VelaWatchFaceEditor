import semanticRulesJson from "../format-definition/semantic-rules.json";
import { createId, type Attributes, type Diagnostic, type ResourceType, type WatchfaceResource } from "./model";
import { FORMAT_RESOURCE_DEFINITION_MAP, FORMAT_STRUCTURE } from "../format-definition/manifestFormat";

type RuleKind =
  | "mutuallyExclusiveAttributes"
  | "anyAttribute"
  | "anyAttributeOrChildAttribute"
  | "attributeLessThan"
  | "childCount"
  | "uniqueChildAttribute";

interface SemanticRule {
  id: string;
  kind: RuleKind;
  target: {
    scope: "root" | "resource";
    resourceTypes?: ResourceType[];
  };
  attributes?: string[];
  attribute?: string;
  childAttribute?: string;
  left?: string;
  right?: string;
  minimum?: number;
  maximum?: number;
  when?: {
    attribute: string;
    values: string[];
    negate?: boolean;
  };
  code: string;
  severity: Diagnostic["severity"];
  message: string;
}

interface SemanticRuleSet {
  $schema?: string;
  schemaVersion: 1;
  rules: SemanticRule[];
}

function fail(message: string): never {
  throw new Error(`semantic-rules.json 无效：${message}`);
}

function loadRules(value: unknown): SemanticRuleSet {
  if (!value || typeof value !== "object") fail("根值必须是对象");
  const ruleSet = value as SemanticRuleSet;
  if (ruleSet.schemaVersion !== 1 || !Array.isArray(ruleSet.rules)) fail("schemaVersion 或 rules 无效");
  const ids = new Set<string>();
  const rootFields = new Set(FORMAT_STRUCTURE.root.fields.map((field) => field.key));
  for (const rule of ruleSet.rules) {
    if (!rule.id || ids.has(rule.id)) fail(`规则 ID 缺失或重复：${rule.id}`);
    ids.add(rule.id);
    if (!rule.code || !rule.message) fail(`${rule.id} 缺少诊断信息`);
    if (rule.target.scope === "root") {
      for (const key of rule.attributes ?? []) if (!rootFields.has(key)) fail(`${rule.id} 引用了未知根属性 ${key}`);
      continue;
    }
    if (!rule.target.resourceTypes?.length) fail(`${rule.id} 未声明目标资源类型`);
    for (const type of rule.target.resourceTypes) {
      const definition = FORMAT_RESOURCE_DEFINITION_MAP[type];
      if (!definition) fail(`${rule.id} 引用了未知资源类型 ${type}`);
      const fields = new Set(definition.fields.map((field) => field.key));
      const usedAttributes = [
        ...(rule.attributes ?? []),
        rule.attribute,
        rule.left,
        rule.right,
        rule.when?.attribute,
      ].filter((key): key is string => Boolean(key));
      for (const key of usedAttributes) if (!fields.has(key)) fail(`${rule.id} 在 ${type} 中引用了未知属性 ${key}`);
      if (rule.childAttribute && !definition.child?.fields.some((field) => field.key === rule.childAttribute)) {
        fail(`${rule.id} 在 ${type} 中引用了未知子属性 ${rule.childAttribute}`);
      }
    }
  }
  return ruleSet;
}

export const SEMANTIC_RULES = loadRules(semanticRulesJson).rules;

function diagnostic(rule: SemanticRule, location: string, values: Record<string, string> = {}): Diagnostic {
  const message = Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    rule.message,
  );
  return { id: createId("diagnostic"), severity: rule.severity, code: rule.code, message, location };
}

function conditionMatches(rule: SemanticRule, attrs: Attributes): boolean {
  if (!rule.when) return true;
  const matches = rule.when.values.includes(attrs[rule.when.attribute] ?? "");
  return rule.when.negate ? !matches : matches;
}

export function validateRootSemanticRules(attrs: Attributes, location: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const rule of SEMANTIC_RULES) {
    if (rule.target.scope !== "root") continue;
    if (rule.kind === "mutuallyExclusiveAttributes"
      && (rule.attributes ?? []).filter((attribute) => Boolean(attrs[attribute])).length > 1) {
      diagnostics.push(diagnostic(rule, location));
    }
  }
  return diagnostics;
}

export function validateResourceSemanticRules(resource: WatchfaceResource, location: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const rule of SEMANTIC_RULES) {
    if (rule.target.scope !== "resource" || !rule.target.resourceTypes?.includes(resource.type)) continue;
    if (!conditionMatches(rule, resource.attrs)) continue;

    if (rule.kind === "anyAttribute" && !(rule.attributes ?? []).some((key) => Boolean(resource.attrs[key]))) {
      diagnostics.push(diagnostic(rule, location));
    } else if (rule.kind === "anyAttributeOrChildAttribute"
      && !resource.attrs[rule.attribute ?? ""]
      && !resource.children.some((child) => Boolean(child.attrs[rule.childAttribute ?? ""]))) {
      diagnostics.push(diagnostic(rule, location));
    } else if (rule.kind === "attributeLessThan") {
      const left = Number(resource.attrs[rule.left ?? ""]);
      const right = Number(resource.attrs[rule.right ?? ""]);
      if (Number.isFinite(left) && Number.isFinite(right) && left >= right) diagnostics.push(diagnostic(rule, location));
    } else if (rule.kind === "childCount"
      && ((rule.minimum !== undefined && resource.children.length < rule.minimum)
        || (rule.maximum !== undefined && resource.children.length > rule.maximum))) {
      diagnostics.push(diagnostic(rule, location, { type: resource.attrs.type ?? resource.type }));
    } else if (rule.kind === "uniqueChildAttribute") {
      const values = new Set<string>();
      for (const child of resource.children) {
        const value = child.attrs[rule.childAttribute ?? ""] ?? "";
        if (value && values.has(value)) diagnostics.push(diagnostic(rule, location, { value }));
        values.add(value);
      }
    }
  }
  return diagnostics;
}
