import { describe, it, expect } from "vitest";
import { importProjectVirtualFiles, runConcurrent } from "./projectIO";

describe("runConcurrent", () => {
  it("空数组应立即返回", async () => {
    let callCount = 0;
    await runConcurrent([], 4, async () => {
      callCount++;
    });
    expect(callCount).toBe(0);
  });

  it("应以指定并发限制完整执行全部任务", async () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    const executed: number[] = [];
    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;

    await runConcurrent(items, 5, async (item) => {
      currentConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, currentConcurrency);
      // 模拟微任务耗时
      await new Promise((resolve) => setTimeout(resolve, 5));
      executed.push(item);
      currentConcurrency--;
    });

    expect(executed.length).toBe(25);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(5);
    expect(maxObservedConcurrency).toBeGreaterThanOrEqual(1);
    expect(executed.sort((a, b) => a - b)).toEqual(items);
  });

  it("当限制大于任务总数时，应正常完成", async () => {
    const items = [1, 2, 3];
    const results: number[] = [];

    await runConcurrent(items, 10, async (item) => {
      results.push(item * 2);
    });

    expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });

  it("通过 importProjectVirtualFiles 从虚拟文件列表成功载入项目", async () => {
    const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<Watchface width="212" height="520">
  <Resources>
    <Image name="bg" src="bg.png" />
  </Resources>
  <Theme name="默认主题" type="normal">
    <Layout ref="@bg" x="0" y="0" />
  </Theme>
</Watchface>`;

    const descriptionXml = `<?xml version="1.0" encoding="utf-8"?>
<watch>
  <name>虚拟表盘工程</name>
  <deviceType>O66</deviceType>
</watch>`;

    const mockFile = (content: string, name: string) => {
      return new File([content], name, { type: "text/xml" });
    };

    const virtualEntries = [
      { path: "description.xml", file: mockFile(descriptionXml, "description.xml") },
      { path: "resources/manifest.xml", file: mockFile(manifestXml, "manifest.xml") },
      { path: "resources/bg.png", file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "bg.png", { type: "image/png" }) },
    ];

    const result = await importProjectVirtualFiles(virtualEntries, "O66");
    expect(result.blocked).toBe(false);
    expect(result.project).not.toBeNull();
    expect(result.project?.description.name).toBe("虚拟表盘工程");
    expect(result.project?.themes).toHaveLength(1);
    expect(result.project?.themes[0].layouts).toHaveLength(1);
  });
});
