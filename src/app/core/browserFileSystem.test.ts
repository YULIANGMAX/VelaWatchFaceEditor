import { describe, expect, it } from "vitest";
import { isNativeFileSystemSupported, parseWebkitDirectoryFileList } from "./browserFileSystem";

describe("跨浏览器文件系统兼容 (browserFileSystem)", () => {
  it("环境探测函数应正常返回布尔值", () => {
    expect(typeof isNativeFileSystemSupported()).toBe("boolean");
  });

  it("正确将 webkitRelativePath 转换为项目相对路径", () => {
    const fakeFile1 = new File(["test"], "manifest.xml");
    Object.defineProperty(fakeFile1, "webkitRelativePath", {
      value: "MyWatchface/resources/manifest.xml",
    });

    const fakeFile2 = new File(["png"], "bg.png");
    Object.defineProperty(fakeFile2, "webkitRelativePath", {
      value: "MyWatchface/resources/images/bg.png",
    });

    const entries = parseWebkitDirectoryFileList([fakeFile1, fakeFile2]);
    expect(entries).toEqual([
      { path: "resources/manifest.xml", file: fakeFile1 },
      { path: "resources/images/bg.png", file: fakeFile2 },
    ]);
  });
});
