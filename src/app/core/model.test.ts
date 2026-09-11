import { describe, expect, it } from "vitest";
import { compileWatchface, createCompileInput } from "./compiler";
import { createBlankProject, DEVICE_PROFILES, getDeviceDefinition } from "./model";

describe("设备定义驱动编译", () => {
  it("遍历逐设备定义并直接按设备规则完成构建", async () => {
    expect(DEVICE_PROFILES).toHaveLength(16);
    for (const profile of DEVICE_PROFILES) {
      const project = createBlankProject(profile.id);
      const result = await compileWatchface(createCompileInput(project), { device: getDeviceDefinition(profile.id) });
      expect(result.faceCount, profile.id).toBe(1);
      expect(result.resourceCount, profile.id).toBe(0);
      expect(result.bytes.length, profile.id).toBeGreaterThan(0xa8);
    }
  });
});
