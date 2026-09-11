# manifest.xml 格式定义规范

> ⚠️ **重要声明 / 性质与免责说明**：
> 本规范定义之 XML 节点结构、属性约束规则及语义检查项，**系基于官方公开工程样本通过 AI 辅助逆向分析反推建立，并非小米官方格式说明文档**。

本规范规定了表盘 `manifest.xml` 格式定义的加载、检查机制及边界原则。节点、属性、字段顺序、必填关系、枚举、数值范围、默认值、引用目标和适用条件不得在解析器或校验器中另建一份字段表。

## 文件职责

- `manifest-spec.json`：纯格式规范，不包含 `description.xml` 或编辑器元数据。解析器、序列化器和基础校验读取它。
- `manifest-spec.schema.json`：使用 JSON Schema Draft 2020-12 检查 `manifest-spec.json` 本身。
- `semantic-rules.json`：可声明的跨字段与子元素规则，例如属性互斥、至少满足一个属性、字段大小关系和条件子元素数量。
- `semantic-rules.schema.json`：检查语义规则文件本身。

运行时加载器还检查 JSON Schema 不便表达的内部一致性，包括资源类型重复、默认值引用未知属性、条件引用未知属性、引用目标不存在，以及结构中的资源类型列表与实际定义不一致。规范错误会在应用启动时立即抛出，不会静默降级。

## 定义与设备能力的边界

`manifest-spec.json` 决定表盘 XML 规范允许表达什么；`device-definition/devices/*.json` 决定某台 Vela 设备支持其中哪些能力。编辑器最终使用两者交集。设备定义不得扩张格式边界，格式定义也不得包含设备编码判断。

## 扩展方式

修改已有节点或属性时，只改 `manifest-spec.json`。新增可声明语义规则时，优先扩展通用规则种类并写入 `semantic-rules.json`。图片尺寸一致性、资源循环引用、PNG 像素检查等需要读取文件或构建关系图的规则由通用算法处理器执行，不在资源类型分支中复制字段定义。

编辑器中的中文标签、控件类型、字段分组、帮助文本和预览能力属于编辑模块，保存在 `app/editor/manifestEditorMetadata.ts`。`description.xml` 只是项目描述，继续由项目读写代码处理，二者均不进入格式 JSON。

新增资源类型后，解析、序列化和基础校验可由 JSON 自动识别；编辑器仍需增加对应展示元数据。若该类型具有新的 BIN 编码结构，还需增加对应的通用编码器。格式声明不能代替 UI 与二进制编码算法。

`app/format-definition/manifestFormat.ts` 只负责加载并检查格式规范；它不依赖设备、编辑器或编译器。`app/editor/manifestEditorSchema.ts` 在编辑模块内部把纯格式字段与界面元数据组合为表单定义，不会反向污染格式规范。
