# 设备定义规范

> ⚠️ **重要声明 / 性质与免责说明**：
> 本规范所规定之设备能力矩阵、屏幕显示参数、BIN 头部字段与属性收窄列表，**系基于公开表盘样本通过 AI 辅助逆向分析与工程反推整理建立，并非小米官方设备说明文档**。

本规范规定了 Vela 设备定义的结构、能力收窄逻辑与消费边界。本目录是设备定义的唯一来源，也是表盘编辑与编译输出两个模块共同使用的基础契约。它管理设备身份、Vela 系统边界、屏幕参数、设备支持的 manifest 能力、BIN 头部、资源编码方式和数据源能力；设备定义只能收窄纯格式规范，不能扩张表盘 XML 格式。

## 消费关系

- **表盘编辑模块**：接收完整设备定义，使用设备列表、画布尺寸、圆角、数据源、资源类型和属性约束。资源添加入口会隐藏不支持的类型，属性控件会禁用不支持的字段，状态层还会阻止绕过界面的非法写入。
- **编译输出模块**：接收同一份完整设备定义。所有编译期设备差异必须来自 JSON，不得在编译器中按 `deviceType`、商品名或画布尺寸判断设备。
- **下游边界纪律**：两个下游模块不得另建、复制或补充设备特例。设备 JSON 增加能力后，由设备定义模块统一校验并向下游提供。

## 文件命名与注册

每台设备使用一个 JSON，文件名必须与 `description.xml` 的 `deviceType` 完全一致：

```text
src/app/device-definition/devices/<deviceType>.json
```

例如 Xiaomi Smart Band 10 使用 `devices/O66.json`。设备编码保持官方大写形式，不使用商品名、代号或自定义别名作文件名。注册表通过 `import.meta.glob` 自动发现目录中的 JSON，因此增加复用现有编译格式的 Vela 设备时不需要修改 TypeScript 索引。

## 字段规范

- `schemaVersion`：设备定义结构版本，目前固定为 `2`。
- `deviceType`：设备编码，同时也是 JSON 文件名和 `description.xml` 值。
- `name`：界面显示的商品名。
- `system`：固定为 `vela`；其他系统会在启动时拒绝注册。
- `display`：画布宽、高和圆角，预设设备不可在项目中覆盖。
- `manifest.resourceTypes`：该设备可用的格式资源类型。`all-format` 表示允许格式规范中的全部类型，`allow-list` 表示仅允许 `include`；`exclude` 始终优先。
- `manifest.attributes`：设备级属性允许列表、排除列表及已验证值。目标使用 `Watchface`、`Theme`、`Layout`、资源类型或 `资源类型/子节点名`。界面、校验器与编译器共同消费，不允许在下游补充特例。
- `binary.header.size`：该设备 BIN 全局头的字节数。
- `binary.header.combinationFlagsBase`：写入全局头 `0x1E` 的设备基础标志；编译器只在其上叠加配色/Slot、多普通样式和 AOD 标志。
- `binary.header.fixedFields`：按绝对偏移写入的设备固定头字段，支持十六进制字节以及小端 `uint8`、`uint16`、`uint32`。
- `binary.resourceEncoding`：描述图片抖动算法（`indexed8Dithering`、`imageArrayIndexed8Dithering`）、数据项参数模式与默认刷新周期。所有设备统一采用经过验证的标准打包规范。
- `dataSources.catalog`：引用 `data-sources/<名称>.json` 中的基础数据源编码目录；目录只复用数据，不参与编译分支。
- `dataSources.policy`：`all-known` 表示允许编译器已知数据源并应用 `exclude`；`allow-list` 表示仅允许 `include`。
- `dataSources.allowRawCodes`：是否允许在 manifest 中直接使用二字节十六进制数据源。
- `dataSources.codeOverrides`：该设备的数据源二字节编码覆盖，也可用于增加设备专属数据源。
- `dataSources.verification`：能力是否已经真机验证。未验证设备必须写 `unverified`，编辑器会在项目属性中显示。

`device.schema.json` 供编辑器和 IDE 检查结构；运行时注册表还会检查未知字段、文件名、重复设备编码、非负圆角和能力列表冲突。胶囊屏设备允许圆角略大于短边一半，渲染时由轮廓裁切。

现有文件使用属性 `allow-list`。全部设备统一采用经官方表盘样本验证的打包规范（manifest 顺序、Widget 扩展、indexed8 WuQuant 量化与 ImageArray 编码）。

## 扩展边界

构建接口直接接收当前设备的完整定义，不接收编译目标，也不根据 `deviceType`、商品名或画布尺寸选择编码逻辑。已由 Schema 表达的差异只需写入新设备 JSON；如果未来出现新的差异种类，应先扩展通用 Schema 和通用解释逻辑，再由设备 JSON 给出具体值，禁止在编译器中增加设备编码判断。
