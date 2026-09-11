import { beforeEach, describe, expect, it } from "vitest";
import { createBlankProject } from "../core/model";
import { calculateProjectChecksum, useEditorStore } from "./editorStore";

describe("项目内容修订号", () => {
  beforeEach(() => useEditorStore.getState().resetProject("O66"));

  it("引用跳转可逐层返回到原来的选中位置", () => {
    const themeId = useEditorStore.getState().project.themes[0]!.id;
    useEditorStore.getState().setSelection({ kind: "layout", themeId, layoutId: "layout-a" });
    useEditorStore.getState().navigateTo({ kind: "resource", resourceId: "slot" });
    useEditorStore.getState().navigateTo({ kind: "resource", resourceId: "widget" });

    expect(useEditorStore.getState().selection).toEqual({ kind: "resource", resourceId: "widget" });
    useEditorStore.getState().navigateBack();
    expect(useEditorStore.getState().selection).toEqual({ kind: "resource", resourceId: "slot" });
    useEditorStore.getState().navigateBack();
    expect(useEditorStore.getState().selection).toEqual({ kind: "layout", themeId, layoutId: "layout-a" });
  });

  it("后退后选中新的对象会清空前进记录", () => {
    useEditorStore.getState().setSelection({ kind: "resource", resourceId: "first" });
    useEditorStore.getState().setSelection({ kind: "resource", resourceId: "second" });
    useEditorStore.getState().navigateBack();

    expect(useEditorStore.getState().navigationForward).toEqual([{ kind: "resource", resourceId: "second" }]);
    useEditorStore.getState().setSelection({ kind: "resource", resourceId: "third" });
    expect(useEditorStore.getState().navigationForward).toEqual([]);
  });

  it("新项目未保存；打开项目为干净状态", () => {
    let state = useEditorStore.getState();
    expect(state.contentRevision).not.toBe(state.savedRevision);
    state.loadProject(createBlankProject("O66"), [], true);
    state = useEditorStore.getState();
    expect(state.contentRevision).toBe(state.savedRevision);
  });

  it("修改属性后标脏，改回原值后恢复干净状态", () => {
    useEditorStore.getState().loadProject(createBlankProject("O66"), [], true);
    let state = useEditorStore.getState();
    expect(state.contentRevision).toBe(state.savedRevision);

    // 修改表盘名称：标脏
    useEditorStore.getState().updateWatchface("name", "修改后");
    state = useEditorStore.getState();
    expect(state.contentRevision).not.toBe(state.savedRevision);

    // 将表盘名称改回原值：恢复干净
    useEditorStore.getState().updateWatchface("name", "未命名表盘");
    state = useEditorStore.getState();
    expect(state.contentRevision).toBe(state.savedRevision);
  });

  it("修改属性保存后恢复干净，undo 回改动前标脏，redo 回已保存状态恢复干净", () => {
    useEditorStore.getState().loadProject(createBlankProject("O66"), [], true);
    useEditorStore.getState().updateWatchface("name", "修改后");
    let state = useEditorStore.getState();
    expect(state.contentRevision).not.toBe(state.savedRevision);

    state.markSaved();
    state = useEditorStore.getState();
    expect(state.contentRevision).toBe(state.savedRevision);

    // 撤销到修改前（未命名表盘），因与已保存的“修改后”不同，标脏
    state.undo();
    expect(useEditorStore.getState().contentRevision).not.toBe(useEditorStore.getState().savedRevision);

    // 重做到已保存状态（修改后），恢复干净
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().contentRevision).toBe(useEditorStore.getState().savedRevision);
  });

  it("增加资源后标脏，删除后恢复干净状态", () => {
    useEditorStore.getState().loadProject(createBlankProject("O66"), [], true);
    const id = useEditorStore.getState().addResource("Image", { name: "test_img", src: "test.png" });
    let state = useEditorStore.getState();
    expect(state.contentRevision).not.toBe(state.savedRevision);

    useEditorStore.getState().removeResource(id);
    state = useEditorStore.getState();
    expect(state.contentRevision).toBe(state.savedRevision);
  });

  it("资源库实时落盘操作不改变 manifest 修订号", () => {
    useEditorStore.getState().loadProject(createBlankProject("O66"), [], true);
    const before = useEditorStore.getState().contentRevision;
    useEditorStore.getState().syncAssetLibrary({}, ["images"]);
    useEditorStore.getState().replaceAssetLibrary({}, ["images"]);
    expect(useEditorStore.getState().addAssetFolder("images/icons")).toBe(true);
    expect(useEditorStore.getState().removeAssetFolder("images/icons")).toBe(true);
    expect(useEditorStore.getState().contentRevision).toBe(before);
    expect(useEditorStore.getState().savedRevision).toBe(before);
  });

  it("应用 XML 后保持未保存状态", () => {
    useEditorStore.getState().loadProject(createBlankProject("O66"), [], false);
    const state = useEditorStore.getState();
    expect(state.contentRevision).not.toBe(state.savedRevision);
  });

  it("重命名资源时同步更新所有引用", () => {
    const project = createBlankProject("O66");
    const target = { id: "target", type: "Image" as const, attrs: { name: "before", src: "before.png" }, children: [] };
    const consumer = { id: "consumer", type: "Widget" as const, attrs: { name: "consumer", preview: "@before" }, children: [{ id: "child", attrs: { ref: "@before" } }] };
    project.resources = [target, consumer];
    project.watchface.name = "@before";
    project.themes[0].attrs.preview = "@before";
    project.themes[0].layouts = [{ id: "layout", attrs: { ref: "@before", x: "0", y: "0" } }];
    useEditorStore.getState().loadProject(project, [], true);

    useEditorStore.getState().updateResource("target", "name", "after");

    const renamed = useEditorStore.getState().project;
    expect(renamed.resources[0].attrs.name).toBe("after");
    expect(renamed.resources[1].attrs.preview).toBe("@after");
    expect(renamed.resources[1].children[0].attrs.ref).toBe("@after");
    expect(renamed.watchface.name).toBe("@after");
    expect(renamed.themes[0].attrs.preview).toBe("@after");
    expect(renamed.themes[0].layouts[0].attrs.ref).toBe("@after");
  });
});

describe("布局排序", () => {
  beforeEach(() => useEditorStore.getState().resetProject("O66"));

  const buildProject = () => {
    const project = createBlankProject("O66");
    project.themes[0].layouts = [
      { id: "a", attrs: { ref: "@a", x: "0", y: "0" } },
      { id: "b", attrs: { ref: "@b", x: "0", y: "0" } },
      { id: "c", attrs: { ref: "@c", x: "0", y: "0" } },
    ];
    useEditorStore.getState().loadProject(project, [], true);
    return project;
  };

  it("reorderLayout 将布局移动到目标索引", () => {
    const project = buildProject();
    const themeId = project.themes[0].id;

    useEditorStore.getState().reorderLayout(themeId, "c", 0);
    expect(useEditorStore.getState().project.themes[0].layouts.map((layout) => layout.id)).toEqual(["c", "a", "b"]);

    useEditorStore.getState().reorderLayout(themeId, "c", 2);
    expect(useEditorStore.getState().project.themes[0].layouts.map((layout) => layout.id)).toEqual(["a", "b", "c"]);
  });

  it("越界索引被钳制到边界", () => {
    const project = buildProject();
    const themeId = project.themes[0].id;

    useEditorStore.getState().reorderLayout(themeId, "a", 99);
    expect(useEditorStore.getState().project.themes[0].layouts.map((layout) => layout.id)).toEqual(["b", "c", "a"]);
  });

  it("原位与无效调用不改变布局顺序", () => {
    const project = buildProject();
    const themeId = project.themes[0].id;

    useEditorStore.getState().reorderLayout(themeId, "b", 1);
    useEditorStore.getState().reorderLayout(themeId, "missing", 0);
    useEditorStore.getState().reorderLayout("missing-theme", "a", 0);
    expect(useEditorStore.getState().project.themes[0].layouts.map((layout) => layout.id)).toEqual(["a", "b", "c"]);
  });
});

describe("资源排序", () => {
  beforeEach(() => useEditorStore.getState().resetProject("O66"));

  const buildProject = () => {
    const project = createBlankProject("O66");
    project.resources = [
      { id: "a", type: "image", attrs: { name: "a" }, children: [] },
      { id: "b", type: "image", attrs: { name: "b" }, children: [] },
      { id: "c", type: "image", attrs: { name: "c" }, children: [] },
    ];
    useEditorStore.getState().loadProject(project, [], true);
    return project;
  };

  it("reorderResource 将资源移动到目标索引", () => {
    buildProject();

    useEditorStore.getState().reorderResource("c", 0);
    expect(useEditorStore.getState().project.resources.map((resource) => resource.id)).toEqual(["c", "a", "b"]);

    useEditorStore.getState().reorderResource("c", 2);
    expect(useEditorStore.getState().project.resources.map((resource) => resource.id)).toEqual(["a", "b", "c"]);
  });

  it("越界索引被钳制到边界", () => {
    buildProject();

    useEditorStore.getState().reorderResource("a", 99);
    expect(useEditorStore.getState().project.resources.map((resource) => resource.id)).toEqual(["b", "c", "a"]);
  });

  it("原位与无效调用不改变资源顺序", () => {
    buildProject();

    useEditorStore.getState().reorderResource("b", 1);
    useEditorStore.getState().reorderResource("missing", 0);
    expect(useEditorStore.getState().project.resources.map((resource) => resource.id)).toEqual(["a", "b", "c"]);
  });
});

describe("资源复制", () => {
  beforeEach(() => useEditorStore.getState().resetProject("O66"));

  const buildProject = () => {
    const project = createBlankProject("O66");
    project.resources = [
      { id: "a", type: "image", attrs: { name: "a", src: "a.png" }, children: [{ id: "child-a", attrs: { ref: "@b" } }] },
      { id: "b", type: "image", attrs: { name: "b" }, children: [] },
    ];
    useEditorStore.getState().loadProject(project, [], true);
    return project;
  };

  it("duplicateResource 在原资源后插入副本并选中", () => {
    buildProject();

    useEditorStore.getState().duplicateResource("a");
    const state = useEditorStore.getState();
    const resources = state.project.resources;
    expect(resources.map((resource) => resource.id)).toEqual(["a", expect.stringMatching(/^resource-/), "b"]);
    const copy = resources[1];
    expect(copy.type).toBe("image");
    expect(copy.attrs.name).toBe("a_2");
    expect(copy.attrs.src).toBe("a.png");
    expect(copy.id).not.toBe("a");
    expect(state.selection).toEqual({ kind: "resource", resourceId: copy.id });
  });

  it("duplicateResource 深拷贝子项并生成新子项 id", () => {
    buildProject();

    useEditorStore.getState().duplicateResource("a");
    const copy = useEditorStore.getState().project.resources[1];
    expect(copy.children).toHaveLength(1);
    expect(copy.children[0].attrs).toEqual({ ref: "@b" });
    expect(copy.children[0].id).not.toBe("child-a");
  });

  it("duplicateResource 连续复制生成递增名称", () => {
    buildProject();

    useEditorStore.getState().duplicateResource("a");
    useEditorStore.getState().duplicateResource(useEditorStore.getState().project.resources[1].id);
    const names = useEditorStore.getState().project.resources.map((resource) => resource.attrs.name);
    expect(names).toEqual(["a", "a_2", "a_2_2", "b"]);
  });

  it("duplicateResource 对无效 id 不做任何事", () => {
    buildProject();

    useEditorStore.getState().duplicateResource("missing");
    expect(useEditorStore.getState().project.resources.map((resource) => resource.id)).toEqual(["a", "b"]);
  });
});

describe("主题复制", () => {
  beforeEach(() => useEditorStore.getState().resetProject("O66"));

  it("duplicateTheme 克隆主题与其所有图层并高亮选中", () => {
    const project = createBlankProject("O66");
    project.themes = [
      {
        id: "theme-1",
        attrs: { type: "normal", name: "原主题", bgColor: "#112233" },
        layouts: [{ id: "l1", attrs: { ref: "@bg", x: "10", y: "20" } }],
      },
      {
        id: "theme-2",
        attrs: { type: "AOD", name: "息屏主题" },
        layouts: [],
      },
    ];
    useEditorStore.getState().loadProject(project, [], true);

    useEditorStore.getState().duplicateTheme("theme-1");
    const state = useEditorStore.getState();
    expect(state.project.themes).toHaveLength(3);
    const cloned = state.project.themes[1];
    expect(cloned.attrs.name).toBe("原主题 (副本)");
    expect(cloned.attrs.bgColor).toBe("#112233");
    expect(cloned.attrs.type).toBe("normal");
    expect(cloned.layouts).toHaveLength(1);
    expect(cloned.layouts[0].id).not.toBe("l1");
    expect(cloned.layouts[0].attrs).toEqual({ ref: "@bg", x: "10", y: "20" });
    expect(state.selectedThemeId).toBe(cloned.id);
    expect(state.selection).toEqual({ kind: "theme", themeId: cloned.id });
  });

  it("calculateProjectChecksum 能够精准感知属性微调且具有可复原性", () => {
    const project = createBlankProject("O66");
    project.resources.push({
      id: "res1",
      type: "Image",
      attrs: { name: "bg", src: "bg.png" },
      children: [],
    });
    project.themes[0].layouts.push({
      id: "l1",
      attrs: { ref: "@bg", x: "10", y: "20" },
    });

    const initial = calculateProjectChecksum(project);

    // 微调 1px
    project.themes[0].layouts[0].attrs.x = "11";
    const check1 = calculateProjectChecksum(project);
    expect(check1).not.toBe(initial);

    // 变回原值 10
    project.themes[0].layouts[0].attrs.x = "10";
    const check2 = calculateProjectChecksum(project);
    expect(check2).toBe(initial);
  });

  it("updateChild 生成差量补丁并就地更新子元素", () => {
    useEditorStore.getState().resetProject("O66");
    const project = createBlankProject("O66");
    project.resources.push({
      id: "res1",
      type: "ImageArray",
      attrs: { name: "arr" },
      children: [{ id: "c1", attrs: { src: "1.png" } }],
    });
    useEditorStore.getState().loadProject(project, [], true);

    useEditorStore.getState().updateChild("res1", "c1", "src", "2.png");
    const state = useEditorStore.getState();
    const child = state.project.resources.find((r) => r.id === "res1")?.children.find((c) => c.id === "c1");
    expect(child?.attrs.src).toBe("2.png");
    expect(state.historyPatches).toHaveLength(1);
    expect(state.historyPatches[0].kind).toBe("child_attrs");
  });
});
