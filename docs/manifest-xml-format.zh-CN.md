# manifest.xml 格式解析规范

> ⚠️ **重要声明 / 性质与免责说明**：
> 本文档详述之 `manifest.xml` 标签标准、节点层级、属性语义、表达式语法及数据模型，**系基于公开表盘工程样本与固件特征，通过 AI 辅助逆向工程与反推分析交叉验证得出，并非小米官方发布的正式公开说明文档**。本文档仅供表盘设计爱好者、逆向工程学习者及开源社区技术参考。

本文档涵盖通过样本反推确认的 Vela 表盘规范的全集与超集定义。

## 1. 规范概述

`manifest.xml` 是 Vela 表盘工程的核心清单文件，描述表盘的全部组件定义、主题配置、坐标布局与数据交互。

XML 的主体由三层层次结构构成：
- `Watchface`：根元素，定义表盘全局配置（如尺寸、ID、动态配色表等）；
- `Resources`：资源定义集合，声明组成表盘的切图、序列帧、数据组件、进度条、组件容器等“积木”；
- `Theme`：表盘主题样式，将资源实例化并按指定 X/Y 坐标放置到画布上。一个表盘可包含多个普通样式（Normal）与对应的息屏样式（AOD）。

## 2. 项目结构

一个可供编译器处理的项目是一个目录，至少包含：

```text
project/
├── manifest.xml
├── preview.png
├── digits/
│   ├── 0.png
│   └── ...
└── 其他图片或脚本
```

允许使用子目录。`manifest.xml` 中的文件路径均为相对路径，以 `manifest.xml` 所在目录为基准解析。

XML 的主体由三层组成：

- `Watchface`：根元素，保存整个表盘的全局设置。
- `Resources`：资源定义集合，即组成表盘的图片、数据组件、容器等“积木”。
- `Theme`：一个表盘样式，把资源放到指定坐标。一个表盘可以包含多个普通样式和 AOD 样式。

最小项目示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="167222065" name="Simple watchface">
    <Resources>
        <Image
            name="preview_0"
            src="preview_0.png"
            compressMethod="RLEReversed"
            format="RGBA32"
            recolorEnable="false"/>
    </Resources>
    <Theme type="normal" name="" preview="@preview_0">
        <Layout ref="@preview_0" x="0" y="0"/>
    </Theme>
</Watchface>
```

### 2.1 名称与引用

`Resources` 中的每个顶层资源都应有唯一的 `name`。其他元素通过 `@资源名` 引用它：

```xml
<Image name="background" src="background.png"/>
<Theme type="normal" preview="@background">
    <Layout ref="@background" x="0" y="0"/>
</Theme>
```

XML 标签和属性名区分大小写；例如仓库官方样本使用 `editBox`，不要改写成 `editbox`。

## 3. `Watchface`：全局配置

已验证的标准核心属性如下：

- `id`：9 位或 12 位十进制数字组成的唯一标识。同一设备不能同时安装两个 ID 相同的表盘。
- `name`：显示名称，可在手机应用或大屏设备上展示。
- `recolorTable`：逗号分隔的十六进制颜色表，例如 `#e8a93f,#08cadb,#b30b0b`。启用表盘的动态配色选项，选定颜色会与图片像素颜色相乘。白色素材通常效果最好。在部分设备（如小米手环 10）上保留像素透明度，部分早期设备不保留。
- `colorGroupTable`：逗号分隔的颜色表。它不对同一图片动态乘色，而是在不同配色方案中选择预先定义的资源。与 `recolorTable` 冲突。

官方生产样本中还包含以下系统级扩展属性：

```xml
width="432"
height="514"
SKU="false"
compressMethod="RLEReversed"
advanced="false"
interactive="false"
powerConsumptionLevel="1"
support_literal="false"
editable="true"
```

- `powerConsumptionLevel`：功耗等级，系说明性质的标称参数（可选 `1` 至 `5`），由创作者自决选择并在表盘信息中展示，与表盘运行时的实际物理功耗和固件硬件调度无直接关联。
- `editable`：是否允许设备端编辑，布尔值（默认为 `false`）。控制是否允许用户在手表上直接编辑表盘（如长按进入自定义配置界面、更换槽位 Slot 中显示的组件等）；未显式启用或设为 `false` 则锁定表盘，禁止在设备端修改。
- `SKU`、`advanced`、`interactive`、`support_literal`：真机实测表盘呈现不受此四项属性影响。在尚未分析出明确作用之前，全设备全量规范一律限死为 `false`，编辑器界面不予呈现；若在 XML 中配置为非 `false`，校验器与编译器将严格阻止构建。

## 4. 通用资源

所有资源位于 `Resources` 中。每个顶层资源必须有 `name`；资源定义的先后顺序不决定显示层级。

### 4.1 `Image`

`Image` 引用一张图片，并指定二进制编码方式：

```xml
<Image
    name="preview_0"
    src="preview_0.png"
    compressMethod="RLEReversed"
    format="RGBA32"
    recolorEnable="false"/>
```

属性：

- `src`：相对于 `manifest.xml` 的图片路径。
- `compressMethod`：压缩方式。支持 `RLEReversed`（官方游程编码）和 `none`（无压缩）。
- `format`：像素格式。
  - `RGBA32`：32 位 RGBA，支持透明度。
  - `RGB565A8`：RGB565 加 8 位透明度。
  - `indexed8`：8 位调色板索引，编码结果最多 256 种颜色；源图片超过 256 种精确颜色时由编译器量化，调色板颜色可以包含透明度。
- `recolorEnable`：允许换色（是否允许素材参与动态换色），可省略，默认 `false`。
- `colorGroup`：为同名资源指定其所属的配色方案。未设置且资源名唯一时，该资源可用于所有配色方案。使用 `colorGroupTable` 时，第一种颜色必须有明确对应的资源，否则编译会失败。

历史样例中曾出现过 `argb8888`，当前规范统一使用 `RGBA32`、`RGB565A8` 或 `indexed8`。

### 4.2 `ImageArray`

`ImageArray` 是尺寸相同的图片序列：

```xml
<ImageArray
    name="digits"
    compressMethod="RLEReversed"
    format="indexed8"
    recolorEnable="false">
    <Image src="digits/0.png"/>
    <Image src="digits/1.png"/>
    <Image src="digits/2.png"/>
</ImageArray>
```

编码属性与 `Image` 相同；具体图片路径写在子元素 `Image` 中。

### 4.3 `Sprite`

`Sprite` 按顺序播放 `ImageArray`，用于帧动画：

```xml
<Sprite
    name="animation"
    ref="@animationFrames"
    repeatCount="0"
    interval="80"/>
```

- `ref`：引用 `ImageArray`。
- `repeatCount`：重复次数；`0` 表示无限循环。
- `interval`：帧间隔，单位为毫秒，不得大于 `65535`。

### 4.4 `File`

`File` 是安装表盘时从包内释放的普通文件，常用于 JavaScript 或 Lua 资源：

```xml
<File
    name="_lua/code/gameContent.txt"
    filename="_lua/code/gameContent.txt"/>
```

`filename` 同时表示编译时读取的相对路径，以及表盘运行时访问的路径。XML 属性名严格区分大小写，必须写为小写 `filename`。

### 4.5 `Translation`

`Translation` 保存多语言字符串：

```xml
<Translation name="widgetTitle">
    <Item language="zh_CN" str="日历"/>
    <Item language="en_US" str="Calendar"/>
    <Item language="ru_RU" str="Календарь"/>
</Translation>
```

每个 `Item` 使用：

- `language`：语言代码。
- `str`：对应文本。

当前已验证支持的 31 种多语言代码如下：

```text
en_US, zh_CN, zh_TW, ja_JP, es_ES, fr_FR, de_DE, ru_RU,
pt_BR, pt_PT, it_IT, ko_KR, tr_TR, nl_NL, th_TH, sv_SE,
da_DK, vi_VN, nb_NO, pl_PL, fi_FI, in_ID, el_GR, ro_RO,
cs_CZ, uk_UA, hu_HU, sk_SK, zh_HK, iw_IL, ar_EG
```

无需为所有语言都提供 `Item`。

## 5. `DataItem*` 数据资源

`DataItem*` 从设备指标读取时间、日期、步数、心率、血氧、天气等数据。

`source` 可以写指标名称，例如 `timeHour`；也可以写不带 `0x` 前缀的十六进制指标代码，例如 `1108`。不同设备支持的指标集合可能不同。

### 5.1 通用属性

- `align`：`left`、`center` 或 `right`；默认 `left`。它会改变 `Layout` 坐标所指的锚点。
- `renderRule`：显示规则。
  - `alwaysShow`：始终显示，默认值。
  - `hideWhenUnitMismatch`：当前单位不匹配时隐藏，例如摄氏/华氏不匹配。
  - `hideWhenOutRange`：指标超出组件定义范围时隐藏。
- `parameter`：刷新周期，单位为毫秒；范围是 `30` 至 `1000`，默认 `1000`。
- `rotation`：旋转角度。

- `supportRecolor`：跟随换色（组件是否跟随全局换色），布尔值（默认为 `false`）。用于 `DataItemImageNumber`、`DataItemImageValues`、`DataItemPointer`、`DataItemArcProgressBar`、`DataItemLineProgressBar`。
  - **三阶联动机制**：
    1. **全局色表层**：根节点 `<Watchface>` 必须配置 `recolorTable` 动态颜色表（官方导出样本中各 `<Theme>` 亦机械冗余复制此串，但语义与底层全由全局统领）；
    2. **素材资源层**：组件通过 `ref` 引用的 `<Image>` 或 `<ImageArray>` 必须显式开启「允许换色」（`recolorEnable="true"`，通常采用 `indexed8` 格式或单色灰度通道）；
    3. **数据开关层**：唯有同时满足全局具备 `recolorTable` 且引用素材资源开启「允许换色」（`recolorEnable="true"`）时，数据资源方可将「跟随换色」（`supportRecolor`）设为 `true`，设备端渲染时将图片像素颜色与用户选定颜色相乘实现变色。若引用素材资源未开启「允许换色」，即便表盘具备动态颜色表，该组件亦必须设为 `false`。

当 `align="left"` 时，坐标锚点是组件左上角；`right` 时是右上角；旋转同样围绕该锚点进行。

### 5.2 `DataItemText`

使用系统字体显示文本，也是文档中唯一可组合多个数据源的 `DataItem`：

```xml
<DataItemText
    name="seconds"
    w="40"
    h="21"
    fontId="misans"
    fontSize="18"
    fontWeight="demibold"
    color="#ffffff"
    style="normal"
    align="left"
    letterSpace="0"
    longMode="dots"
    string="%d">
    <Content source="timeSecond"/>
</DataItemText>
```

主要属性：

- `color`：十六进制文字颜色。
- `opacity`：不透明度，`0` 至 `100`，默认 `100`。
- `fontSize`：字号。
- `fontId`：字体标识。常见系统字体包括 `misanslatin`、`misansw`、`misanstc`、`misans`、`notosans` 等。
- `fontWeight`：字重。支持 `bold`、`demibold`、`extralight`、`heavy`、`light`、`medium`、`normal`、`regular`、`semibold`、`thin` 等标准字重。
- `letterSpace`：字间距。
- `longMode`：文本超出区域时的处理方式。
  - `wrap`：换行。
  - `dots`：用省略号截断（默认值）。
  - `scroll`、`scroll_circular`：滚动。
  - `clip`：直接裁剪。
- `style`：`normal` 为普通布局，`arc` 为沿弧线布局。
- `string`：格式字符串，可以包含 `printf` 风格的 `%d`、`%s`。

`style="normal"` 时还可使用：

- `lineSpace`：行间距，精确行为仍待研究。
- `w`、`h`：文本区域宽高。
- `rotation`：旋转角度。

`style="arc"` 时还可使用：

- `radius`：文本弧线所在圆的半径。
- `verticalAlign`：`top`、`center`、`bottom`，精确行为仍待研究。
- `startAngle`：起始角度。
- `span`：文本覆盖的角度范围。

### 5.3 `DataItemImageNumber`

以绘制好的数字图片显示数值：

```xml
<DataItemImageNumber
    name="minute"
    source="timeMinute"
    ref="@digits"
    leadingZero="true"
    trailingZero="false"
    totalDigits="2"
    decimalDigits="0"
    decimalOffsetX="0"
    align="left"
    space="0"/>
```

所引用的 `ImageArray` 按以下顺序组织：

1. 第 1 至 10 张：数字 `0` 至 `9`。
2. 第 11 张：负号。无有效数据时，某些指标也会显示为两个负号。
3. 第 12 张：小数点，用于距离、睡眠评分等小数。

属性：

- `source`：指标。
- `ref`：引用数字 `ImageArray`。
- `totalDigits`：组件总字符数；负号和小数点也各占一位。
- `decimalDigits`：小数位数。例如 `totalDigits="5"`、`decimalDigits="2"` 时，最大可显示值为 `99.99`。
- `leadingZero`：是否在左侧补零，默认 `false`。
- `trailingZero`：是否在小数部分末尾补零，默认 `false`。
- `decimalOffsetX`：小数点的水平偏移，用于压缩小数点占据的空白，默认 `0`。
- `space`：字符间距，默认 `0`。
- `unitIcon`：可选，引用 `Image`，把单位图片附加到数字组件并参与对齐。

### 5.4 `DataItemImageValues`

按指标所在区间选择图片：

```xml
<DataItemImageValues
    name="batteryLevel"
    source="systemStatusBattery"
    ref="@batteryImages">
    <Param value="0"/>
    <Param value="10"/>
    <Param value="20"/>
    <Param value="30"/>
</DataItemImageValues>
```

- `source`：指标。
- `ref`：引用 `ImageArray`。
- 子元素 `Param` 的 `value`：每张图片对应区间的起始值。

`Param` 作为区间阈值时建议按升序排列，数量不得多于 `ImageArray` 中的图片数。上例中，第一张图片对应 `0` 至 `9`，第二张对应 `10` 至 `19`，依此类推。部分特殊数据源（如天气图标枚举）可能存在非连续或非严格单调排列的场景，因此编辑器对此类情况给出警告提示而非硬性阻断，以便创作者根据实际数据源特征灵活配置。

### 5.5 `DataItemPointer`

按指标旋转图片，适用于时针、分针、秒针和仪表指针：

```xml
<DataItemPointer
    name="secondHand"
    parameter="30"
    source="timeSecond"
    ref="@secondHandImage"
    pivotX="8"
    pivotY="136"
    angleStart="0"
    angleRange="360"
    valueStart="0"
    valueRange="60"/>
```

- `source`：指标。
- `ref`：引用指针 `Image`。
- `valueStart`：最小指标值。
- `valueRange`：指标跨度；有效区间为 `[valueStart, valueStart + valueRange]`。
- `pivotX`、`pivotY`：图片内部的旋转轴坐标。
- `angleStart`：最小值对应的起始角。`0` 对应 12 点方向。
- `angleRange`：到最大值时总共旋转的角度；正值顺时针，负值逆时针。

### 5.6 `DataItemArcProgressBar`

圆弧进度条把引用图片作为纹理，再用当前进度形成的圆弧区域对其进行遮罩：

```xml
<DataItemArcProgressBar
    name="hourProgress"
    source="timeHour"
    ref="@progressImage"
    bg="@progressBackground"
    valueStart="0"
    valueRange="24"
    angleStart="-90"
    angleRange="360"
    pivotX="66"
    pivotY="66"
    barWidth="8"
    barRadius="60"
    endingStyle="round"
    indicatorImage="@indicator"/>
```

此组件会忽略图片的 `recolorEnable="true"`。

属性：

- `source`：当前值指标。
- `ref`：必需，引用用于进度区域的 `Image`。
- `bg`：可选，引用背景 `Image`。
- `valueStart`：最小值。
- `valueStartSource`：提供最小值的另一个指标；优先于 `valueStart`。
- `valueRange`：值跨度。
- `valueRangeSource`：提供最大值或动态量程的关联指标；配置时优先于静态的 `valueRange`。
- `pivotX`、`pivotY`：圆心在图片内部的坐标。
- `angleStart`：最小值对应的角度，`0` 为 12 点方向。
- `angleRange`：完整进度覆盖的角度；正值顺时针，负值逆时针。
- `barRadius`：进度条中心线半径。
- `barWidth`：线宽。例如半径 `90`、线宽 `10` 时，实际占据半径约为 `[85, 95]`。
- `endingStyle`：端点样式，**仅修饰结尾端（终点）**（穿戴端真机实测验证）；起点恒定为圆形（`round`），不响应此属性。结尾端设为 `normal` 时截平为平直端点，设为 `round` 时修饰为半圆头。
- `indicatorImage`：可选，引用指示当前进度值的图片。指示图片以自身中心点为锚点，其自身旋转角度随当前进度条的角度同步旋转（顺时针同向变化，行为如同钟表指针）。
- `indicatorRadius`：可选，指示图片中心点到圆心 `(pivotX, pivotY)` 的物理距离（半径）。当设为 `0` 时，指示图片的中心点与圆心完全重合（例如 50×50 的图片，中心点 25, 25 与圆心重叠）；当大于 `0` 时，指示图片中心沿着该半径的圆周随进度旋转定位。未显式配置时默认与 `barRadius` 一致。

### 5.7 `DataItemLineProgressBar`

线性进度条与圆弧进度条类似，但沿起点至终点的直线生成遮罩：

```xml
<DataItemLineProgressBar
    name="secondProgress"
    source="timeSecond"
    ref="@progressImage"
    bg="@progressBackground"
    valueStart="0"
    valueRange="60"
    startX="0"
    startY="0"
    endX="300"
    endY="0"
    barWidth="40"
    endingStyle="normal"/>
```

它同样忽略图片的 `recolorEnable="true"`。

除 `source`、`ref`、`bg`、`valueStart`、`valueStartSource`、`valueRange`、`valueRangeSource` 外，还支持：

- `startX`、`startY`：进度线在 `ref` 图片上的起点。
- `endX`、`endY`：终点。
- `barWidth`：线宽。
- `endingStyle`：端点样式，可选 `normal`（默认，平直切平）或 `round`（半圆头圆角），编译写入 Type 0x22 载荷 `+0x10` 标志位的 Bit 0。
- `indicatorImage`：可选的当前值指示图片。以自身中心点跟随当前进度位置移动。
- `offsetX`、`offsetY`：可选，指示图片叠加的物理偏移量（像素，支持带符号整数，二进制写入 Type 0x22 相对偏移 `+0x2C` / `+0x2E`）。
  - **坐标与基准**：以当前进度在起点 `(startX, startY)` 至终点 `(endX, endY)` 之间插值得到的物理坐标 $(x, y)$ 为锚点，指示图片的中心点定位于 $(x + \text{offsetX}, y + \text{offsetY})$，左上角绘制点为 $(x + \text{offsetX} - w/2, y + \text{offsetY} - h/2)$。平移方向恒为直角笛卡尔坐标系下的屏幕绝对 X 轴向右、Y 轴向下，不随非水平（垂直或倾斜）进度条的切线角度偏转。
  - **真机硬边界裁剪**：真机固件绘图上下文以组件自身坐标原点 `(0, 0)` 为绝对硬边界。当指示器居于起点或叠加负向偏移导致计算出的像素坐标 $< 0$ 时，超出 `(0, 0)` 的左侧与顶部半边会被真机固件硬性裁切；而在正坐标空间（$x \ge 0, y \ge 0$）内，固件不会因超出标称图宽高而提前截断。

## 6. `Slot` 与 `Widget`

### 6.1 `Slot`

`Slot` 表示可配置的组件槽位。在手表端长按表盘进入自定义编辑界面时，槽位允许用户在多个微件（`Widget`）间切换，或在多个预设坐标（`Position`）间移动位置。

#### 属性说明

- `name`：槽位名称（必填，如 `Slot1`）。
- `type`：槽位类型，**固定为 `"widget"`**。
- `movable`：是否支持移动位置（选填，`"true"` 或 `"false"`，默认 `"false"`）。为 `"true"` 时，允许用户在手表端自定义界面中把该槽位移动到其他预设坐标。

#### 子元素说明

- `<Item ref="@Widget..." />`：候选微件列表（至少 1 个）。每个 `Item` 必须引用 `Widget`，不能直接引用 `DataItem*`。用户可在手表的编辑界面中选择其中一个微件呈现。
- `<Position x="..." y="..." />`：候选坐标列表（仅在 `movable="true"` 时出现）。定义该槽位支持切换落脚的多处预设坐标。

#### 规范示例

常规多选微件槽位（不可移动）：

```xml
<Slot name="Slot1" type="widget">
    <Item ref="@Widget4"/>
    <Item ref="@Widget3"/>
    <Item ref="@Widget2"/>
    <Item ref="@Widget1"/>
</Slot>
```

支持移动位置的槽位：

```xml
<Slot name="Slot1" type="widget" movable="true">
    <Item ref="@Widget2"/>
    <Position x="72" y="199"/>
    <Position x="72" y="334"/>
</Slot>
```

### 6.2 `Widget`

`Widget` 是组合多个资源的容器：

```xml
<Widget
    name="Widget3"
    flex_direction="row"
    justify_content="flex-start"
    align_items="center"
    gap="-3"
    w="78"
    h="24">
    <Item ref="@hour"/>
    <Item ref="@separator"/>
    <Item ref="@minute"/>
</Widget>
```

属性：

- `widgetName`：在 `Slot` 编辑菜单中显示的名称，可以是文本，也可以引用 `Translation`。
- `groupType`：分组类型，官方规范中固定为 `general`（通用组件），在底层二进制 `resource.bin` 中不分配字节，无需修改。
- `jumpApp`：把组件声明为点击热区以启动系统应用。常见支持的应用标识包括：

```text
pressure, breath, heartrate, sleep, SpO2, sport, activities,
media, settings, compass, flashlight, calendar, remoteCamera,
sportsRecord, alipay, womenHealth, chronograph, weather, phone,
wxpay, timer, findPhone, alarm, recorder, barometer, nfcCard,
voiceAssistant, contact, sportsCourse, temperature, share,
bloodPressure, ECG, vitalityValue, jsApplication, luaApplication,
trainingStatus, todo, miJia, glucose, sms, worldclock,
perpetualcalendar, amap, intercom, navigation, research, wechat
```

部分应用在某些手环上不存在，因而无法启动。

- `w`、`h`：组件宽高。
- `editBox`：可选，`Slot` 编辑页面中的可编辑区域框线图片（通常建议约为实际组件尺寸的 70%）。
- `preview`：可选，`Slot` 编辑页面中的组件预览缩略图（通常建议约为实际组件尺寸的 70%）。
- `args`：可选，启动应用时的参数；用于 `jumpApp="jsApplication"` 或 `jumpApp="luaApplication"` 时可引用 `File`。
- `flex_direction`：启用自动布局，值为 `row`（横向排布）或 `column`（纵向排布）。
- `justify_content`：主轴方向对齐方式。
  - **横向排布（`row`）**：控制水平对齐。支持：
    - `flex-start`：起点对齐（默认，无额外位移偏量；首项若指定 `align="right"` 等负向锚点会自然向左溢出）；
    - `center`：余量居中（以可用总余量 $\text{free\_space} = w - \text{contentRight}$ 为基准，分摊 50% 余量，偏移量为 $\text{free\_space} / 2$）；
    - `flex-end`：末尾对齐（分摊 100% 余量，偏移量为 $\text{free\_space} = w - \text{contentRight}$，子项末位右边界紧贴容器右边缘）。
  - **纵向排布（`column`）**：控制垂直对齐。以子项高度总和（含 gap）$\text{contentBottom}$ 为基准：
    - `flex-start`：顶端对齐（$y = 0$）；
    - `center`：纵向居中（偏移量为 $(h - \text{contentBottom}) / 2$）；
    - `flex-end`：底端对齐（偏移量为 $h - \text{contentBottom}$，最底项底边紧扣容器底边）。
  - 底层二进制编码采用 3-bit 步长枚举掩码：`flex-start` 为 `0`，`center` 为 `0x04`（`1 << 2`），`flex-end` 为 `0x08`（`2 << 2`）。
- `align_content`：交叉轴对齐方式。
  - **横向排布（`row`）**：实际控制垂直方向对齐：
    - `flex-start`：顶端对齐（$y = 0$）；
    - `center`：居中对齐（以各子项图片自身中线与容器纵向中线重合对齐，$y = (h - \text{itemHeight}) / 2$）；
    - `flex-end`：底端对齐（各子项图片底边紧贴容器底边，$y = h - \text{itemHeight}$）。
  - **纵向排布（`column`）**：实际控制水平方向（X 轴）全局定位基准线台阶。在穿戴端实测：
    - `flex-start`：水平基线位于容器左界（$X=0$）。当子项包含 `align="right"` 时，子项以左界为右锚点向左溢出，相对于 `flex-end` 产生 $-\text{maxItemWidth}$（子项最大宽度，如 $68\text{px}$）的左移偏量；
    - `center`：水平基线相对于 `flex-end` 产生 $-\text{maxItemWidth}/2$（如 $-34\text{px}$）的左移偏量；
    - `flex-end`：水平基线使内容整体完全收纳在容器右侧内部，偏移量为 $0$。
    - 三档呈现每阶差值为 $\text{maxItemWidth}/2$（如 $34\text{px}$）的等差台阶式位移（真机组件 19 刚好溢出左边界露出半个 2 与 %，组件 22、25 精确契合）。
  - 底层二进制编码采用 3-bit 步长枚举掩码：`flex-start` 为 `0`，`center` 为 `0x20`（`1 << 5`），`flex-end` 为 `0x40`（`2 << 5`）。
- `align_items`：交叉轴单行/子项水平基准线微调对齐。
  - 在 `flex_direction="row"` 横向单行排布下，穿戴端固件对此属性完全忽略，设置任何值均等同于 `flex-start`（顶端 $y=0$），横向垂直对齐完全由 `align_content` 独占控制。
  - 在 `flex_direction="column"` 纵向列排布下，穿戴端固件以此属性控制子项在上述 `align_content` 确定的大基线内部的相对锚定。实测以横向总余量 $\text{freeSpaceX} = w - \max(\text{width})$ 确定主导锚线 $\text{anchorX} = \max(\text{width}) + \text{offsetX}$（其中 `flex-start` 时 $\text{offsetX}=0$，`center` 时 $\text{offsetX}=\text{freeSpaceX}/2$，`flex-end` 时 $\text{offsetX}=\text{freeSpaceX}$）。`align="right"` 项左移自身宽度贴线，普通项按 `flex-start` 左贴线、`center` 居中切线、`flex-end` 右贴线分布。
  - 底层二进制编码掩码为：`flex-start` 为 `0`，`center` 为 `0x100`（`1 << 8`），`flex-end` 为 `0x200`（`2 << 8`）。
- `gap`：自动布局间距，支持正负数值（穿戴端真机实测验证）；编码公式为 `(Math.abs(gap) & 0x1ff) * 0x800`，间距数值位宽占用 9 bit（取值范围 0~511），负值附带符号标志位 `0x100000`（bit 20）。在真机端表现为子项图层的真实相对重合位移，后声明之子元素图层依序压覆在先声明之子元素图层上方。
- **嵌套微件盒模型（Hierarchical Widget Box Model）**：
  - 当一个 `Widget` 作为子项嵌套于父级 `Widget` 中时，父级自动布局引擎严格以该子微件显式声明的结构体尺寸（`w` 与 `h`）作为其物理排版包围盒，不动态收缩其外部占位。
  - 子微件内部的内容项（如文本、图片数字、单位等）则在子微件声明的 `w` / `h` 矩形框内独立执行其自身的 `flex` 排版（如 `align_items="center"` 居中）。
  - **内外部位移对冲效应**：当父微件指定负向 `gap`（如 `gap="-10"`）使子微件向左切入前项图层时，若子微件内部内容因居中留有余量（如 $(w_{\text{child}} - w_{\text{content}}) / 2 = 10\text{px}$），内部内容的右移居中将自然与外部微件框的左移切入对冲，最终在视觉上呈现精确相切碰触（0 像素净重叠）。

子元素 `Item` 通过 `ref` 引用资源。可以在每个 `Item` 上用 `x`、`y` 显式定位，也可以依赖上述 flex 属性自动布局。

## 7. `Theme` 与 `Layout`

### 7.1 `Theme`

一个 `Theme` 表示一种表盘外观：

```xml
<Theme
    type="normal"
    name="样式 1"
    bgColor="#002200"
    preview="@preview_0">
    <Layout ref="@background" x="0" y="0"/>
    <Layout ref="@timeWidget" x="100" y="50"/>
</Theme>
```

支持的组合方式：

- 只有一个或多个普通样式，不提供 AOD。
- 一个或多个普通样式，共用一个 AOD。
- 每个普通样式各有一个 AOD，即普通样式数与 AOD 数相同。

属性：

- `type`：`normal` 或 `AOD`。
- `name`：样式名称。
- `bgColor`：纯色背景，避免使用整屏纯色图片。
- `preview`：引用预览 `Image`。普通样式应提供；AOD 可以省略。
- `isPhotoAlbumWatchface`：布尔值，系配合官方手机应用（小米运动健康）进行动态相册背景替换的系统级属性。作为非官方表盘编辑器，该属性统一写死固定为 `false`，在界面中默认隐藏，禁止设置为 `true`。

### 7.2 `Layout`

`Layout` 把资源放到主题中的指定坐标：

```xml
<Layout ref="@timeWidget" x="100" y="100"/>
```

- `ref`：要显示的资源。
- `x`、`y`：坐标。

没有显式 `z-index`。同一 `Theme` 中，越靠后的 `Layout` 越晚绘制，因此覆盖在前面的元素之上。

### 7.3 编辑器一致性边界

| 能力 | 编辑 | 校验 | 画布预览 |
|---|---:|---:|---:|
| 文档明确的标签、属性、枚举与引用 | 完整 | 严格 | 按已知语义 |
| 图片数字、区间图片、指针、Sprite、Widget | 完整 | 严格 | 支持 |
| 进度条（含指示器旋转、`indicatorRadius`、`offsetX/Y` 与原点裁剪） | 完整 | 严格 | 完全支持，与真机实测一致 |
| 普通文本、圆弧文本（待研究参数仅近似） | 完整 | 严格 | 支持；`letterSpace`、`lineSpace`、`verticalAlign` 近似模拟 |
| `Translation`、`File`、`appWidget`、`dualTime` | 完整 | 严格 | 设备占位，不伪造系统效果 |
| `letterSpace`、`lineSpace`、`verticalAlign` 等文本待验证语义 | 无损 | 结构与类型 | 标记为近似或未模拟 |
| P65 样本已观测官方属性 | 完整 | 按设备 JSON 限值 | 设备专属字段明确提示 |
| 未知属性和未知元素 | 无损往返 | 构建阻断 | 不支持 |

纯格式规范以小米官方生产样本和固件运行环境为事实依据确定节点与属性全集；各具体设备的 JSON 配置文件再决定本机可编辑和可编译的子集。未知扩展不会阻断打开，也不会被丢弃，但在取得官方二进制定义前一律阻止编译。

## 8. 规范一致性与验证原则

1. **官方生产标准优先**：
   - 本规范全面支持官方生产表盘出现的各项扩展，包括多语言本地化字典（`Translation`）、微件组合（`Widget`）、负一屏可配置卡片（`Slot`）、官方 `editBox` 属性以及多普通主题与 AOD 的完整对应关系。
2. **设备边界强制约束**：
   - 不同的硬件平台（如手环窄屏、智能手表方圆屏）对支持的组件类型及属性值范围有明确限制。编辑器与内置编译器共同消费设备定义 JSON，确保导出的表盘严格符合目标设备的运行限制。
3. **无损往返与安全防御**：
   - 未在规范内声明的私有 XML 标签与属性，在编辑器载入、编辑与写回时均获完整保留；但在编译为 `resource.bin` 时将触发阻断报错，防止未知数据写入导致穿戴设备系统崩溃。
