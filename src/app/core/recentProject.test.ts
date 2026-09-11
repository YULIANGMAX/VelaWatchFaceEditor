import { describe, expect, it } from "vitest";
import {
  MAX_DISPLAYED_RECENT_PROJECTS,
  MAX_RECENT_PROJECTS,
  type RecentProjectDirectory,
} from "./recentProject";

function makeItem(name: string): RecentProjectDirectory {
  return {
    projectName: name,
    projectPath: `${name}/description.xml`,
    directory: { name } as FileSystemDirectoryHandle,
  };
}

describe("最近项目配额与展示逻辑", () => {
  it("系统上限记录最多10个，首页展示最多5个", () => {
    expect(MAX_RECENT_PROJECTS).toBe(10);
    expect(MAX_DISPLAYED_RECENT_PROJECTS).toBe(5);
  });

  it("当记录包含超过5项时，仅展示前5项；删除某项后后续项自动替补补齐5项", () => {
    // 模拟持久化存储中保存的 7 个项目（上限10个）
    let storedList: RecentProjectDirectory[] = [
      makeItem("Project 1"),
      makeItem("Project 2"),
      makeItem("Project 3"),
      makeItem("Project 4"),
      makeItem("Project 5"),
      makeItem("Project 6"),
      makeItem("Project 7"),
    ];

    // 初始展示前 5 个
    let displayed = storedList.slice(0, MAX_DISPLAYED_RECENT_PROJECTS);
    expect(displayed.length).toBe(5);
    expect(displayed.map((p) => p.projectName)).toEqual([
      "Project 1",
      "Project 2",
      "Project 3",
      "Project 4",
      "Project 5",
    ]);

    // 用户删除第 2 个项目 ("Project 2")
    const targetToRemove = displayed[1];
    storedList = storedList.filter((item) => item.projectName !== targetToRemove.projectName);

    // 重新切片展示：原第6个项目 ("Project 6") 自动补位跟上
    displayed = storedList.slice(0, MAX_DISPLAYED_RECENT_PROJECTS);
    expect(displayed.length).toBe(5);
    expect(displayed.map((p) => p.projectName)).toEqual([
      "Project 1",
      "Project 3",
      "Project 4",
      "Project 5",
      "Project 6",
    ]);

    // 再连续删除2个 ("Project 1", "Project 3")
    storedList = storedList.filter(
      (item) => item.projectName !== "Project 1" && item.projectName !== "Project 3"
    );
    displayed = storedList.slice(0, MAX_DISPLAYED_RECENT_PROJECTS);
    // 剩余 4 项，全部展示
    expect(displayed.length).toBe(4);
    expect(displayed.map((p) => p.projectName)).toEqual([
      "Project 4",
      "Project 5",
      "Project 6",
      "Project 7",
    ]);
  });
});
