# Vela 表盘编辑器 (Vela Watch Face Editor)

小米 / Redmi Vela 系统表盘可视化编辑与编译工具。支持由官方样本确认的 Vela 官方 `manifest.xml` 规范集，并由设备定义（Device Definition）直接驱动 `resource.bin` 二进制编译。

---

## 核心功能

### 1. 桌面端与文件系统
- **桌面客户端模式**：基于 Tauri 2.0 构建，通过 Rust 原生命令（`rfd` 系统文件对话框与原生文件流 I/O）提供极速、无沙箱限制的磁盘读写能力；
- **物理绝对路径与无感秒开**：
  - 桌面客户端全面支持并展示 Windows 真实物理绝对路径（如 `E:\WorkSpaces\...\example\band8_standard`）；
  - 最近项目列表持久化记忆最近 10 个项目路径，重开项目时**彻底免除浏览器的二次授权弹窗**，实现毫秒级快速恢复。
- **项目目录固定结构**：
  - 按 Vela 官方结构规范化读写 `preview/`、`resources/`（含 `manifest.xml`）、`description.xml` 与编译产物 `resource.bin`。

### 2. 表盘资源与资产管理
- **资源树映射**：直接映射 `resources/` 目录（隐藏内部的 `manifest.xml`），支持多层级文件夹，默认折叠。
- **即时文件操作**：新建文件夹、重命名、拖拽移动文件/文件夹、删除等操作即时同步写盘。
- **多选与拖放**：支持单选、Ctrl 多选及 Shift 连选；拖动已选文件可批量移动至目标目录。
- **外部变更感知**：自动监听并同步在 Windows 资源管理器中对资源文件的增删改操作。

### 3. 表盘可视化设计与预览
- **画布与图层**：支持缩放、标尺、圆角裁剪、10 px 网格吸附及居中定位；图层支持拖动排序与复制。
- **丰富组件支持**：支持 `Image`、`ImageArray`、`Sprite`、`Translation`、`DataItemText`、`DataItemImageNumber`、`DataItemImageValues`、`DataItemPointer`、`DataItemArcProgressBar`、`DataItemLineProgressBar`、`Slot`、`Widget` 等组件的可视化编辑与属性配置。
- **多主题与 AOD**：完整管理 Normal（普通）主题与 AOD（息屏）主题，支持属性独立配置与切换。
- **环境与配色模拟**：支持实时模拟 `recolorTable` / `colorGroupTable` 调色板、摄氏/华氏度单位及各类时间与健康数据源的动态数值模拟。

### 4. 规范校验与源码编辑
- **严密格式与语义校验**：基于 `manifest-spec.json` 与 `semantic-rules.json` 对引用关系、图片尺寸一致性、数字序列帧数、调色板合法性、循环引用等进行深度静态诊断。
- **源码与未知扩展保护**：内置 `manifest.xml` 源码查看与直接修改；未知 XML 属性及节点原样无损载入与保留，若其缺乏二进制语义定义，校验模块将明确阻断构建以防刷入设备异常。

### 5. 内置编译系统
- **纯 TypeScript 编译内核**：在 Web Worker 线程中独立完成 `resource.bin` 编译，包含图片量化（indexed8）、RLE 压缩、二进制描述符组装与校验，运行时完全不依赖外部可执行文件。

---

## 项目工程结构

```text
VelaWatchFaceEditor/
├── docs/                      # 架构规范、分析报告与格式技术文档
├── example/                   # 官方及标准测试用表盘项目夹具
└── src/                       # 编辑器源码与运行根目录
    ├── app/                   # 前端核心源码 (React 19 + TypeScript + Zustand)
    │   ├── components/        # 页面视图、侧边栏、属性检查器、画布与对话框
    │   ├── core/              # 编译管线、文件系统适配层、XML 序列化与数据度量
    │   ├── device-definition/ # 16 款 Vela 设备定义 JSON 与 Schema 注册表
    │   ├── format-definition/ # manifest 规范与语义规则 JSON
    │   └── store/             # Zustand 全局状态与撤销/重做历史
    ├── src-tauri/             # Tauri 2.0 桌面端工程 (Rust 后端)
    │   ├── src/               # Rust 源码 (lib.rs: 原生文件 I/O 与文件选择对话框)
    │   ├── Cargo.toml         # Rust 依赖与二进制定义
    │   ├── tauri.conf.json    # Tauri 配置 (关闭 bundle，仅输出独立便携 exe)
    │   └── target/release/    # 桌面独立构建产物 (app.exe, ~8.44 MB)
    ├── 01-dev-web.bat         # 脚本：启动网页端热重载开发服务器
    ├── 02-build-desktop.bat   # 脚本：一键编译桌面端独立绿色发布版 (app.exe)
    ├── 03-run-desktop.bat     # 脚本：启动已编译的桌面原生程序
    ├── package.json           # 项目脚本与前端依赖清单
    ├── tsconfig.json          # TypeScript 项目配置
    └── vite.config.ts         # Vite 构建配置
```

---

## 脚本与运行指南

进入 `src/` 目录，可通过如下批处理脚本（Windows 下直接双击）或命令行运行：

### 1. 快捷批处理脚本（推荐）

| 脚本文件 | 说明 | 对应命令 |
| :--- | :--- | :--- |
| **`01-dev-web.bat`** | 自动检装依赖并启动 Vite 网页端本地开发服务器 | `npm ci && npm run dev` |
| **`02-build-desktop.bat`** | 手动一键编译 Tauri 桌面端独立便携单文件程序 | `npm run tauri:build` |
| **`03-run-desktop.bat`** | 启动已编译好的原生桌面端程序（`app.exe`） | 直接运行独立 exe |

### 2. NPM 命令清单

```powershell
cd src

# 1. 安装依赖
npm ci

# 2. 网页端热重载开发 (默认地址: http://127.0.0.1:4173)
npm run dev

# 3. 严格类型检查 (0 错误)
npm run typecheck

# 4. 执行全套单元测试 (26 个套件，137 项测试全通)
npm test

# 5. 前端静态包构建 (输出到 dist/)
npm run build

# 6. 桌面端热重载开发 (启动 Tauri 窗口 + Vite)
npm run tauri:dev

# 7. 桌面端绿色版构建 (编译独立可执行文件，不生成安装包)
npm run tauri:build
```

---

## 桌面端构建产物说明

本项目桌面端编译遵循**绿色、免安装、单文件便携**原则：
- **可执行文件路径**：`src/src-tauri/target/release/app.exe`（大小约 **8.44 MB**）；
- **便携性**：生成的 `app.exe` 仅依赖 Windows 10/11 自带的 WebView2 运行时，无需安装其他运行库，解压即可运行。

---

## 支持的设备列表

设备预设由 `src/app/device-definition/devices/<deviceType>.json` 动态自动发现，目前原生支持 16 款 Vela 设备：

| 系列 | 设备型号及代号 |
| :--- | :--- |
| **手环系列** | Xiaomi Smart Band 8 (`M79`)、Xiaomi Smart Band 8 Pro (`N82`)、Xiaomi Smart Band 9 (`O65`)、Xiaomi Smart Band 9 Pro (`O82`)、Xiaomi Smart Band 10 (`O66`) |
| **Redmi Watch 系列** | Redmi Watch 3 Active (`M82`)、Redmi Watch 3 Lite (`M81`)、Redmi Watch 4 (`N62`)、Redmi Watch 5 (`O62`)、Redmi Watch 5 Active (`O83`)、Redmi Watch 5 Lite (`O81`)、Redmi Watch 6 (`P65`) |
| **Xiaomi Watch 系列** | Xiaomi Watch S1 Pro (`M69`)、Xiaomi Watch S3 (`N65`)、Xiaomi Watch S4 (`O65S`)、Xiaomi Watch S4 Sport (`O61`) |

如需新增复用现有 Vela 二进制协议的设备，只需在 `src/app/device-definition/devices/` 增加以设备编码命名的 JSON 文件，详见 [设备定义模块技术规范](../docs/device-definition-spec.zh-CN.md)。

---

## 格式支持与安全原则

1. **白名单收窄机制**：`manifest-spec.json` 定义 XML 规范的集合，设备 JSON 负责根据实际硬件能力收窄可编辑与可编译的字段范围，杜绝非法属性导致真机崩溃。
2. **未知扩展无损保留**：遇到未在规范内声明的 XML 节点与属性时，编辑器保证在载入、可视化编辑、保存与撤销过程中**完整无损保留**原始位置和内容，但在编译器中予以显式拦截，防止盲目写入未知字节。
3. **真实设备部署建议**：向真实穿戴设备推送 `.bin` 前，务必确认所有校验项均为绿灯，并保留官方表盘底包以备恢复。
