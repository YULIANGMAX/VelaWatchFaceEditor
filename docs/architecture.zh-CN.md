# 系统架构与分层边界

> ⚠️ **重要声明 / 性质与免责说明**：
> 本文所述之系统分层、能力收窄逻辑与二进制编译器实现，**均系基于公开工程样本与固件特征通过 AI 辅助逆向反推得出，并非小米官方说明文档**。

项目按总功能划分为三个模块，而不是按页面或业务对象拆分。

## 设备定义模块

代码入口为 `src/app/device-definition`。逐设备 JSON 是设备能力的唯一事实来源，也是表盘编辑模块与编译输出模块共同使用的上游契约。它负责 Vela 设备白名单、显示参数、可用 manifest 资源与属性、BIN 头部和数据源能力；下游模块只能消费解析、校验后的设备定义，不能各自维护设备判断或另一份设备配置。

当前支持 16 台 Vela 设备：Redmi Watch 3 Active、Redmi Watch 3 Lite、Redmi Watch 4、Redmi Watch 5、Redmi Watch 5 Active、Redmi Watch 5 Lite、Redmi Watch 6、Xiaomi Smart Band 8、8 Pro、9、9 Pro、10、Xiaomi Watch S1 Pro、S3、S4、S4 Sport。

## 表盘编辑模块

负责项目目录、`description.xml`、`resources/manifest.xml`、资源管理、属性编辑、校验和画布预览。纯格式规范覆盖小米官方规范及样本确认的 Vela 全量标准与超集属性；某台设备可以编辑和编译哪些字段和值，由该设备 JSON 收窄。

`src/app/format-definition/manifest-spec.json` 只定义 `manifest.xml` 的节点、属性、枚举、范围、默认值、引用类型和适用条件；`semantic-rules.json` 保存可声明的跨字段格式规则。编辑器元数据属于编辑模块，`description.xml` 属于项目描述，两者均不写入格式规范。

编辑模块读取设备列表、画布尺寸、圆角、数据源、属性允许列表和已验证值。P65 开放已观测官方字段；其他设备暂不据此扩张。未知 XML 扩展属于项目模型的一部分，可无损保存，但编辑器不为未知语义生成控件，编译器也不会忽略它。

## 编译输出模块

代码入口为 `src/app/core/compiler`。负责把已通过编辑模块校验的项目编译为 `resource.bin`。构建输入包含 manifest 模型、资源文件及 `description.xml` 的项目版本，设备差异则直接传入完整设备定义；编译器不接受外部工具的目标参数，也不按设备编码、商品名或画布尺寸分支。所有编译期设备差异都必须先成为设备定义 Schema 的通用字段，再在对应设备 JSON 中给值，由编译器统一解释。

依赖方向固定为：纯 `manifest.xml` 格式定义不依赖任何下游模块；设备定义只能从格式能力中取子集；表盘编辑模块与编译输出模块分别消费同一份设备定义。编辑器只修改项目中的 XML 与资源，编译器只读取项目和设备定义生成 BIN，两者彼此不传递设备特例，编译输出亦不反向修改项目或设备文件。

## 运行载体与原生支持

编辑器支持网页端与原生桌面客户端双模运行：
- **Web 模式**：通过 Vite 提供服务，文件系统采用现代浏览器的 `File System Access API`。
- **桌面客户端模式（Tauri 2.0）**：Rust 后端（位于 `src/src-tauri`）提供系统原生对话框（`rfd`）与原生文件流读写能力；前端抽象层（`nativeFileSystem.ts`）将其封装为标准 `FileSystemDirectoryHandle` 接口并注入物理绝对路径属性。双模无缝兼容，业务层逻辑完全零修改复用。
