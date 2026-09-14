// 编辑器展示与控件配置，不属于 manifest.xml 格式规范。
export const MANIFEST_EDITOR_METADATA = {
  "visualResourceTypes": [
    "Image",
    "ImageArray",
    "Sprite",
    "DataItemText",
    "DataItemImageNumber",
    "DataItemImageValues",
    "DataItemPointer",
    "DataItemArcProgressBar",
    "DataItemLineProgressBar",
    "Slot",
    "Widget"
  ],
  "rootFields": [
    {
      "key": "id",
      "label": "表盘 ID",
      "control": "text",
      "help": "必须为 9 位或 12 位数字",
      "action": "generateWatchfaceId"
    },
    {
      "key": "name",
      "label": "表盘名称",
      "control": "textOrReference"
    },
    {
      "key": "width",
      "label": "画布宽度",
      "control": "number",
      "readOnly": true
    },
    {
      "key": "height",
      "label": "画布高度",
      "control": "number",
      "readOnly": true
    },
    {
      "key": "SKU",
      "label": "SKU 模式",
      "control": "boolean"
    },
    {
      "key": "compressMethod",
      "label": "全局压缩方式",
      "control": "select"
    },
    {
      "key": "advanced",
      "label": "高级表盘",
      "control": "boolean"
    },
    {
      "key": "interactive",
      "label": "交互表盘",
      "control": "boolean"
    },
    {
      "key": "powerConsumptionLevel",
      "label": "功耗等级",
      "control": "select"
    },
    {
      "key": "support_literal",
      "label": "支持字面量",
      "control": "boolean"
    },
    {
      "key": "editable",
      "label": "允许设备端编辑",
      "control": "boolean"
    },
    {
      "key": "recolorTable",
      "label": "动态颜色表",
      "control": "text"
    },
    {
      "key": "colorGroupTable",
      "label": "颜色组表",
      "control": "text"
    }
  ],
  "themeFields": [
    {
      "key": "type",
      "label": "主题类型",
      "control": "select"
    },
    {
      "key": "name",
      "label": "主题名称",
      "control": "text"
    },
    {
      "key": "bgColor",
      "label": "背景颜色",
      "control": "color"
    },
    {
      "key": "preview",
      "label": "预览图片",
      "control": "reference"
    },
    {
      "key": "isPhotoAlbumWatchface",
      "label": "照片相册表盘",
      "control": "boolean",
      "previewSupport": "device",
      "hidden": true
    }
  ],
  "layoutFields": [
    {
      "key": "ref",
      "label": "资源",
      "control": "reference"
    },
    {
      "key": "x",
      "label": "X 坐标",
      "control": "number"
    },
    {
      "key": "y",
      "label": "Y 坐标",
      "control": "number"
    }
  ],
  "resources": [
    {
      "type": "Image",
      "label": "图片",
      "group": "基础",
      "description": "单张 PNG 图片资源",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "src",
          "label": "资源路径",
          "control": "asset"
        },
        {
          "key": "compressMethod",
          "label": "压缩方式",
          "control": "select"
        },
        {
          "key": "format",
          "label": "像素格式",
          "control": "select"
        },
        {
          "key": "recolorEnable",
          "label": "动态换色",
          "control": "boolean"
        },
        {
          "key": "colorGroup",
          "label": "颜色组",
          "control": "colorGroup"
        }
      ]
    },
    {
      "type": "ImageArray",
      "label": "图片序列",
      "group": "基础",
      "description": "同尺寸图片组成的帧序列",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "compressMethod",
          "label": "压缩方式",
          "control": "select"
        },
        {
          "key": "format",
          "label": "像素格式",
          "control": "select"
        },
        {
          "key": "recolorEnable",
          "label": "动态换色",
          "control": "boolean"
        },
        {
          "key": "colorGroup",
          "label": "颜色组",
          "control": "colorGroup"
        }
      ],
      "child": {
        "tag": "Image",
        "fields": [
          {
            "key": "src",
            "label": "资源路径",
            "control": "asset"
          }
        ]
      }
    },
    {
      "type": "Sprite",
      "label": "帧动画",
      "group": "基础",
      "description": "按间隔播放 ImageArray",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "ref",
          "label": "图片序列",
          "control": "reference"
        },
        {
          "key": "repeatCount",
          "label": "重复次数",
          "control": "number"
        },
        {
          "key": "interval",
          "label": "帧间隔（ms）",
          "control": "number"
        }
      ]
    },
    {
      "type": "File",
      "label": "附加文件",
      "group": "基础",
      "description": "安装时释放的脚本或数据文件",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "filename",
          "label": "资源路径",
          "control": "asset"
        }
      ]
    },
    {
      "type": "Translation",
      "label": "多语言文本",
      "group": "基础",
      "description": "组件名称或系统文本的本地化字符串",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        }
      ],
      "child": {
        "tag": "Item",
        "fields": [
          {
            "key": "language",
            "label": "语言",
            "control": "select"
          },
          {
            "key": "str",
            "label": "文本",
            "control": "text"
          }
        ]
      }
    },
    {
      "type": "DataItemText",
      "label": "系统文本",
      "group": "数据",
      "description": "使用设备系统字体显示指标",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "align",
          "label": "对齐",
          "control": "select",
          "help": "默认 left。 · 决定 Layout 坐标所指的锚点",
          "section": "common"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common"
        },
        {
          "key": "w",
          "label": "宽度",
          "control": "number",
          "section": "normal"
        },
        {
          "key": "h",
          "label": "高度",
          "control": "number",
          "section": "normal"
        },
        {
          "key": "fontId",
          "label": "字体",
          "control": "select",
          "previewSupport": "partial"
        },
        {
          "key": "fontSize",
          "label": "字号",
          "control": "number"
        },
        {
          "key": "fontWeight",
          "label": "字重",
          "control": "select"
        },
        {
          "key": "color",
          "label": "文字颜色",
          "control": "color"
        },
        {
          "key": "opacity",
          "label": "不透明度",
          "control": "number"
        },
        {
          "key": "letterSpace",
          "label": "字间距",
          "control": "number",
          "previewSupport": "partial"
        },
        {
          "key": "lineSpace",
          "label": "行间距",
          "control": "number",
          "section": "normal",
          "previewSupport": "partial"
        },
        {
          "key": "longMode",
          "label": "溢出处理",
          "control": "select",
          "section": "normal",
          "previewSupport": "partial"
        },
        {
          "key": "style",
          "label": "布局方式",
          "control": "select"
        },
        {
          "key": "string",
          "label": "格式文本",
          "control": "textOrReference"
        },
        {
          "key": "radius",
          "label": "圆弧半径",
          "control": "number",
          "section": "arc"
        },
        {
          "key": "verticalAlign",
          "label": "垂直对齐",
          "control": "select",
          "section": "arc",
          "previewSupport": "partial"
        },
        {
          "key": "startAngle",
          "label": "起始角度",
          "control": "number",
          "section": "arc"
        },
        {
          "key": "span",
          "label": "圆弧跨度",
          "control": "number",
          "section": "arc"
        }
      ],
      "child": {
        "tag": "Content",
        "fields": [
          {
            "key": "source",
            "label": "数据源",
            "control": "dataSource"
          }
        ]
      }
    },
    {
      "type": "DataItemImageNumber",
      "label": "数字图片",
      "group": "数据",
      "description": "使用数字图片序列显示数值",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "source",
          "label": "数据源",
          "control": "dataSource",
          "section": "common"
        },
        {
          "key": "align",
          "label": "对齐",
          "control": "select",
          "help": "默认 left。 · 决定 Layout 坐标所指的锚点",
          "section": "common"
        },
        {
          "key": "renderRule",
          "label": "显示规则",
          "control": "select",
          "help": "默认 alwaysShow。",
          "section": "common",
          "previewSupport": "partial"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common"
        },
        {
          "key": "supportRecolor",
          "label": "支持动态换色",
          "control": "boolean",
          "section": "common",
          "previewSupport": "device",
          "hidden": true
        },
        {
          "key": "ref",
          "label": "图片序列",
          "control": "reference"
        },
        {
          "key": "totalDigits",
          "label": "总字符数",
          "control": "number"
        },
        {
          "key": "decimalDigits",
          "label": "小数位",
          "control": "number"
        },
        {
          "key": "leadingZero",
          "label": "前导零",
          "control": "boolean"
        },
        {
          "key": "trailingZero",
          "label": "末尾补零",
          "control": "boolean"
        },
        {
          "key": "decimalOffsetX",
          "label": "小数点偏移",
          "control": "number"
        },
        {
          "key": "space",
          "label": "字符间距",
          "control": "number"
        },
        {
          "key": "unitIcon",
          "label": "单位图片",
          "control": "reference"
        }
      ]
    },
    {
      "type": "DataItemImageValues",
      "label": "区间图片",
      "group": "数据",
      "description": "根据指标区间切换图片",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "source",
          "label": "数据源",
          "control": "dataSource",
          "section": "common"
        },
        {
          "key": "renderRule",
          "label": "显示规则",
          "control": "select",
          "help": "默认 alwaysShow。",
          "section": "common",
          "previewSupport": "partial"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common"
        },
        {
          "key": "supportRecolor",
          "label": "支持动态换色",
          "control": "boolean",
          "section": "common",
          "previewSupport": "device",
          "hidden": true
        },
        {
          "key": "ref",
          "label": "图片序列",
          "control": "reference"
        }
      ],
      "child": {
        "tag": "Param",
        "fields": [
          {
            "key": "value",
            "label": "阈值",
            "control": "number"
          }
        ]
      }
    },
    {
      "type": "DataItemPointer",
      "label": "旋转指针",
      "group": "数据",
      "description": "围绕图片内轴点旋转",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "source",
          "label": "数据源",
          "control": "dataSource",
          "section": "common"
        },
        {
          "key": "renderRule",
          "label": "显示规则",
          "control": "select",
          "help": "默认 alwaysShow。",
          "section": "common",
          "previewSupport": "partial"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common",
          "hidden": true
        },
        {
          "key": "supportRecolor",
          "label": "支持动态换色",
          "control": "boolean",
          "section": "common",
          "previewSupport": "device",
          "hidden": true
        },
        {
          "key": "ref",
          "label": "指针图片",
          "control": "reference"
        },
        {
          "key": "valueStart",
          "label": "最小值",
          "control": "number"
        },
        {
          "key": "valueStartSource",
          "label": "最小值数据源",
          "control": "dataSource"
        },
        {
          "key": "valueRange",
          "label": "值跨度",
          "control": "number"
        },
        {
          "key": "valueRangeSource",
          "label": "跨度数据源",
          "control": "dataSource"
        },
        {
          "key": "pivotX",
          "label": "轴点 X",
          "control": "number"
        },
        {
          "key": "pivotY",
          "label": "轴点 Y",
          "control": "number"
        },
        {
          "key": "angleStart",
          "label": "起始角度",
          "control": "number"
        },
        {
          "key": "angleRange",
          "label": "旋转角度",
          "control": "number"
        }
      ]
    },
    {
      "type": "DataItemArcProgressBar",
      "label": "圆弧进度",
      "group": "数据",
      "description": "沿圆弧遮罩进度图片",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "source",
          "label": "数据源",
          "control": "dataSource",
          "section": "common"
        },
        {
          "key": "renderRule",
          "label": "显示规则",
          "control": "select",
          "help": "默认 alwaysShow。",
          "section": "common",
          "previewSupport": "partial"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common",
          "hidden": true
        },
        {
          "key": "supportRecolor",
          "label": "支持动态换色",
          "control": "boolean",
          "section": "common",
          "previewSupport": "device",
          "hidden": true
        },
        {
          "key": "ref",
          "label": "进度图片",
          "control": "reference"
        },
        {
          "key": "bg",
          "label": "背景图片",
          "control": "reference"
        },
        {
          "key": "valueStart",
          "label": "最小值",
          "control": "number"
        },
        {
          "key": "valueStartSource",
          "label": "最小值数据源",
          "control": "dataSource"
        },
        {
          "key": "valueRange",
          "label": "值跨度",
          "control": "number"
        },
        {
          "key": "valueRangeSource",
          "label": "跨度数据源",
          "control": "dataSource"
        },
        {
          "key": "endingStyle",
          "label": "端点样式",
          "control": "select"
        },
        {
          "key": "indicatorImage",
          "label": "指示图片",
          "control": "reference",
          "previewSupport": "partial"
        },
        {
          "key": "pivotX",
          "label": "圆心 X",
          "control": "number"
        },
        {
          "key": "pivotY",
          "label": "圆心 Y",
          "control": "number"
        },
        {
          "key": "angleStart",
          "label": "起始角度",
          "control": "number"
        },
        {
          "key": "angleRange",
          "label": "圆弧角度",
          "control": "number"
        },
        {
          "key": "barRadius",
          "label": "半径",
          "control": "number"
        },
        {
          "key": "barWidth",
          "label": "线宽",
          "control": "number"
        },
        {
          "key": "indicatorRadius",
          "label": "指示半径",
          "control": "number",
          "previewSupport": "partial"
        }
      ]
    },
    {
      "type": "DataItemLineProgressBar",
      "label": "线性进度",
      "group": "数据",
      "description": "沿直线遮罩进度图片",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "source",
          "label": "数据源",
          "control": "dataSource",
          "section": "common"
        },
        {
          "key": "renderRule",
          "label": "显示规则",
          "control": "select",
          "help": "默认 alwaysShow。",
          "section": "common",
          "previewSupport": "partial"
        },
        {
          "key": "parameter",
          "label": "刷新周期",
          "control": "number",
          "step": 10,
          "help": "单位毫秒，默认 1000。",
          "section": "common"
        },
        {
          "key": "rotation",
          "label": "旋转角度",
          "control": "number",
          "step": 1,
          "section": "common",
          "hidden": true
        },
        {
          "key": "supportRecolor",
          "label": "支持动态换色",
          "control": "boolean",
          "section": "common",
          "hidden": true
        },
        {
          "key": "ref",
          "label": "进度图片",
          "control": "reference"
        },
        {
          "key": "bg",
          "label": "背景图片",
          "control": "reference"
        },
        {
          "key": "valueStart",
          "label": "最小值",
          "control": "number"
        },
        {
          "key": "valueStartSource",
          "label": "最小值数据源",
          "control": "dataSource"
        },
        {
          "key": "valueRange",
          "label": "值跨度",
          "control": "number"
        },
        {
          "key": "valueRangeSource",
          "label": "跨度数据源",
          "control": "dataSource"
        },
        {
          "key": "endingStyle",
          "label": "端点样式",
          "control": "select"
        },
        {
          "key": "indicatorImage",
          "label": "指示图片",
          "control": "reference",
          "previewSupport": "partial"
        },
        {
          "key": "startX",
          "label": "起点 X",
          "control": "number"
        },
        {
          "key": "startY",
          "label": "起点 Y",
          "control": "number"
        },
        {
          "key": "endX",
          "label": "终点 X",
          "control": "number"
        },
        {
          "key": "endY",
          "label": "终点 Y",
          "control": "number"
        },
        {
          "key": "barWidth",
          "label": "线宽",
          "control": "number"
        },
        {
          "key": "offsetX",
          "label": "指示偏移 X",
          "control": "number",
          "previewSupport": "partial"
        },
        {
          "key": "offsetY",
          "label": "指示偏移 Y",
          "control": "number",
          "previewSupport": "partial"
        }
      ]
    },
    {
      "type": "Slot",
      "label": "组件槽位",
      "group": "组合",
      "description": "用户可选组件或系统组件槽位",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "type",
          "label": "槽位类型",
          "control": "select"
        },
        {
          "key": "appWidgetID",
          "label": "系统组件 ID",
          "control": "select",
          "section": "system",
          "previewSupport": "device"
        }
      ],
      "child": {
        "tag": "Item",
        "fields": [
          {
            "key": "ref",
            "label": "引用资源",
            "control": "reference"
          }
        ]
      }
    },
    {
      "type": "Widget",
      "label": "组合组件",
      "group": "组合",
      "description": "组合多个资源的布局容器",
      "fields": [
        {
          "key": "name",
          "label": "资源名称",
          "control": "text"
        },
        {
          "key": "widgetName",
          "label": "显示名称",
          "control": "textOrReference"
        },
        {
          "key": "groupType",
          "label": "分组类型",
          "control": "select",
          "hidden": true
        },
        {
          "key": "jumpApp",
          "label": "点击启动应用",
          "control": "select",
          "previewSupport": "device"
        },
        {
          "key": "args",
          "label": "启动参数文件",
          "control": "reference",
          "section": "application",
          "previewSupport": "device"
        },
        {
          "key": "w",
          "label": "宽度",
          "control": "number"
        },
        {
          "key": "h",
          "label": "高度",
          "control": "number"
        },
        {
          "key": "editBox",
          "label": "编辑区域图",
          "control": "reference",
          "previewSupport": "device"
        },
        {
          "key": "preview",
          "label": "组件预览图",
          "control": "reference",
          "previewSupport": "device"
        },
        {
          "key": "flex_direction",
          "label": "排列方向",
          "control": "select",
          "section": "flex"
        },
        {
          "key": "justify_content",
          "label": "主轴对齐",
          "control": "select",
          "section": "flex"
        },
        {
          "key": "align_content",
          "label": "多行对齐",
          "control": "select",
          "section": "flex",
          "previewSupport": "partial"
        },
        {
          "key": "align_items",
          "label": "交叉轴对齐",
          "control": "select",
          "section": "flex"
        },
        {
          "key": "gap",
          "label": "元素间距",
          "control": "number",
          "section": "flex",
          "previewSupport": "partial"
        }
      ],
      "child": {
        "tag": "Item",
        "fields": [
          {
            "key": "ref",
            "label": "引用资源",
            "control": "reference"
          },
          {
            "key": "x",
            "label": "X",
            "control": "number"
          },
          {
            "key": "y",
            "label": "Y",
            "control": "number"
          }
        ]
      }
    }
  ]
} as const;

export const DESCRIPTION_EDITOR_FIELDS = [
  {
    "key": "version",
    "label": "项目版本",
    "kind": "text",
    "valueType": "string",
    "required": true
  },
  {
    "key": "author",
    "label": "作者",
    "kind": "text",
    "valueType": "string"
  }
] as const;
