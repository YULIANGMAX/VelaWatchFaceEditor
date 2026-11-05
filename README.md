# Vela 表盘编辑器 (VelaWatchFaceEditor)

<p align="center">
  <strong>适用于 VelaOS 可穿戴设备的表盘编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri 2.0" />
  <img src="https://img.shields.io/badge/Vite-6.x-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 6" />
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20Desktop-brightgreen?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square" alt="License: GPL-3.0" />
</p>

<p align="center">
  <img src="./screenshot.png" alt="Vela 表盘编辑器界面预览" width="100%" />
</p>

---

## ⚠️ 已知问题 (Known Issues)

> ### **目前仅在【红米手表 6 (Redmi Watch 6)】上完成实机测试与验证！**
>
>
> - 📱 **作者仅有红米手表 6**：从设计排版、属性配置、Web Worker 编译到 `.bin` 导入实机的全流程，**目前仅在红米手表 6 上通过了完整测试与实机验证**。
> - 🔍 **其余机型兼容性需自行探索**：项目中预置的其它 15+ 款设备（如小米手表 S 系列、小米手环 8/9/10 系列、Redmi Watch 3/4/5 系列等）的规约配置均基于官方公开样本逆向反推，**尚未经实体真机逐一烧录验证**。由于各机型固件版本与渲染实现可能存在细微差异，**实际兼容情况需要使用者自行尝试与探索**。

---

## 💡 示例工程 (Examples)

项目在 [`examples/`](./examples) 目录下提供了开箱即用的示例工程，分别展示了两种工程模式（纯 XML 声明式与 Lua 脚本驱动式）：

- 📱 **[`Simple`](./examples/Simple) —— 经典全功能数字表盘（XML 声明式）**
  - **技术方案**：纯 XML 配置驱动（基于 `manifest.xml` 与内置控件，无 Lua 脚本）。
  - **目标设备**：红米手表 6（Redmi Watch 6，432×514）。
  - **示例核心**：
    - **基础时钟与日历**：大字号时分数字、中文月日及“星期几”汉字图集（`ImageArray`）。
    - **系统与健康数据**：步数统计、实时心率、睡眠时长、多阶电量图标以及天气状态与气温。
    - **Flex 弹性布局**：使用 `Widget` 的 Flexbox 容器属性（`flex_direction`、`justify_content`、`align_items`、`gap` 等）实现清晰规整的排版。
    - **应用快捷跳转**：通过 `jumpApp` 配置触控交互，点击直达手表内置应用（运动、设置、天气、日历、心率、睡眠等）。
  - **适用场景**：学习 Vela 表盘基础 XML 节点规约、数据源（`DataItemImageNumber` / `DataItemImageValues`）绑定与布局排版的标准入门参考。

- ⚡ **[`FLUX`](./examples/FLUX) —— 流体漫溢动效表盘（LVGL + Lua 脚本驱动）**
  - **技术方案**：Lua 脚本驱动（基于 LVGL 渲染引擎与 `dataman` 数据总线）。
  - **目标设备**：红米手表 6（Redmi Watch 6，432×514）。
  - **示例核心**：
    - **流体灌装走秒动效**：还原类似 Apple Watch Flux 的液体漫溢视觉，采用底层基底与顶层擦除层双层裁剪，随秒数动态驱动 60 FPS 平滑高度擦除动效。
    - **黄金分割动态撞色**：采用黄金分割色相步进算法（137.75°），全天 1440 分钟每分钟生成自适应纯净撞色，且午夜完美闭环。
    - **极致性能与 0 GC**：动画与数据刷新全链路实现运行时 0 临时内存分配（0 GC），避免嵌入式 GC 停顿与掉帧；支持双路时钟冷启原子对齐与 RLE 紧凑格式字形贴图。
  - **适用场景**：进阶开发者学习 Vela 手表 Lua 脚本编写、LVGL 控件与动画（`Anim`）体系、`dataman` 硬件数据订阅与 Q24.8 定点数解析的范例。

---

## 📚 技术规范与工程文档

> ⚠️ **重要声明**：以下各篇底层技术规范、封包协议与 XML 语义解析文档，**均系基于公开样本与固件，通过 AI 辅助逆向工程与反推分析整理得出，并非小米官方发布的正式说明文档**。仅供技术学习、逆向研究与社区开发参考。

- 🛠️ **[源码工程与运行构建指南](./src/README.md)**：包含开发调试、Tauri 桌面端便携编译、脚本使用及 16 款设备清单；

- 📐 **[系统架构与分层边界](./docs/architecture.zh-CN.md)**：系统三层解耦与原生桥接架构；
- 📱 **[设备定义规范](./docs/device-definition-spec.zh-CN.md)**：16 款设备规约、能力收窄与扩展边界；
- 📋 **[manifest.xml 格式定义规范](./docs/format-definition-spec.zh-CN.md)**：XML 节点、属性规约与语义检查机制；
- 📜 **[manifest.xml 格式解析规范](./docs/manifest-xml-format.zh-CN.md)**：标签定义、坐标空间与表达式语法；
- 📦 **[resource.bin 二进制格式规范](./docs/resource-bin-format.zh-CN.md)**：0x30 头部、0x40 条目与 32 字节对齐机制；
- 🖼️ **[图像编码与量化研究](./docs/image-encoding-research.zh-CN.md)**：WuQuant 调色板算法与无损图像存储方案。

---

## 📄 开源协议与免责声明

- 本项目遵循 **[GNU General Public License v3.0 (GPL-3.0)](./LICENSE)** 开源协议。
  - 任何人均可自由获取、使用与修改本项目源代码；
  - **传染性约束 (Copyleft)**：凡基于本项目进行的二次开发、功能修改、衍生作品或编译分发版本，**均必须同样遵循 GPL-3.0 协议开源其全部源代码**，严禁将本项目核心逻辑闭源化或转化为私有商业闭源软件。
- **免责声明**：本项目为第三方逆向工程与表盘制作工具，仅供个人学习与技术交流。项目与小米集团（Xiaomi Corporation）无官方隶属或商业关联。“Xiaomi”、“Redmi”、“Vela”等商标权益归属原权利人。
