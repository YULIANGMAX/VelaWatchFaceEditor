-- ============================================================================
-- 小米 Vela 智能手表表盘脚本 (LVGL 渲染引擎)
-- ============================================================================
-- 核心功能与特性：
-- 1. 双图层垂直擦除效果：底层基底 (baseLayer) 与顶层擦除层 (wipeLayer) 叠加，
--    顶层高度随秒数 (0~59) 动态裁剪，产生双色交界自底向上充盈的走秒擦除动效。
-- 2. 配色系统：采用方案 B 黄金分割色相步进算法 (137.75° = 551/1440 * 360°)，
--    每分钟自适应计算纯净撞色，全天 1440 分钟无重复且午夜完美闭环。
-- 3. 随走秒自然呈现色块擦除与正负形交替。
-- ============================================================================

local lvgl = require("lvgl")
local dataman = require("dataman")

-- 屏幕基准尺寸
local SCREEN_W, SCREEN_H = 432, 514

--- 获取脚本所在目录的资源绝对路径
--- @param src string 资源相对路径文件名
--- @return string 资源的完整绝对路径
local function imgPath(src)
  return SCRIPT_PATH .. src
end

--- 通用全屏容器构造辅助函数
--- @param parent table|nil 父容器
--- @param opa integer|nil 背景不透明度
--- @return table LVGL 容器对象
local function createFullScreenContainer(parent, opa)
  local obj = lvgl.Object(parent, {
    x = 0,
    y = 0,
    w = SCREEN_W,
    h = SCREEN_H,
    bg_color = "#000000",
    bg_opa = (opa ~= nil) and opa or lvgl.OPA(100),
    border_width = 0,
    pad_all = 0,
    radius = 0
  })
  obj:clear_flag(lvgl.FLAG.SCROLLABLE)
  obj:clear_flag(lvgl.FLAG.CLICKABLE)
  obj:add_flag(lvgl.FLAG.EVENT_BUBBLE)
  return obj
end

--- LVGL 图片组件封装构造函数
--- @param root table 父容器对象
--- @param src string 图片文件名
--- @param x integer 初始 X 坐标
--- @param y integer 初始 Y 坐标
--- @return table LVGL 图片控件对象
local function Image(root, src, x, y)
  local widget = root:Image({
    src = imgPath(src),
    x = x,
    y = y,
    img_recolor_opa = 255
  })
  widget:clear_flag(lvgl.FLAG.SCROLLABLE)
  widget:clear_flag(lvgl.FLAG.CLICKABLE)
  widget:add_flag(lvgl.FLAG.EVENT_BUBBLE)
  return widget
end

--- HSL 转十六进制颜色代码 "#RRGGBB"
--- @param h number 色相 (0~360)
--- @param s number 饱和度百分比 (0~100)
--- @param l number 亮度百分比 (0~100)
--- @return string 十六进制颜色代码
local function hslToHex(h, s, l)
  h, s, l = ((h % 360 + 360) % 360) / 60, s / 100, l / 100
  local c = (1 - math.abs(2 * l - 1)) * s
  local x = c * (1 - math.abs(h % 2 - 1))
  local m = l - c / 2
  local i = math.floor(h)
  local r, g, b = c, x, 0
  if i == 1 then r, g, b = x, c, 0
  elseif i == 2 then r, g, b = 0, c, x
  elseif i == 3 then r, g, b = 0, x, c
  elseif i == 4 then r, g, b = x, 0, c
  elseif i == 5 then r, g, b = c, 0, x
  end
  return string.format("#%02X%02X%02X",
    math.floor((r + m) * 255 + 0.5),
    math.floor((g + m) * 255 + 0.5),
    math.floor((b + m) * 255 + 0.5))
end

--- 黄金分割动态配色生成器 (步进角 137.75° = 551/1440 * 360°，全天1440分无重复且午夜完美闭环)
--- @param minuteIndex integer 累计分钟序号 (0~1439)
--- @return string bg, string fg
local function getMinutePalette(minuteIndex)
  local h = ((minuteIndex or 0) * 137.75) % 360
  return hslToHex(h, 42, 12), hslToHex(h, 95, 82)
end

-- ============================================================================
-- 时间数字组件表驱动配置 (时十位、时个位、分十位、分个位)
-- ============================================================================
local DIGIT_CONFIGS = {
  { pattern = "time_hh/%d.rle", x = 23,  y = 43  }, -- 小时十位 (HH)
  { pattern = "time_hl/%d.rle", x = 175, y = 43  }, -- 小时个位 (HL)
  { pattern = "time_mh/%d.rle", x = 53,  y = 200 }, -- 分钟十位 (MH)
  { pattern = "time_ml/%d.rle", x = 173, y = 200 }  -- 分钟个位 (ML)
}

-- 经典初始预览时间：10:08
local DEFAULT_DIGITS = { 1, 0, 0, 8 }

local entry = function()
  -- 当前时间数值与渲染缓存：依次对应 HH, HL, MH, ML，初始直接直装 10:08
  local curTime = { DEFAULT_DIGITS[1], DEFAULT_DIGITS[2], DEFAULT_DIGITS[3], DEFAULT_DIGITS[4] }
  local curHour = 10
  local curMinute = 8
  local hasRealHour = false
  local hasRealMinute = false
  local lastMinuteIndex = -1

  -- ==========================================================================
  -- LVGL UI 界面结构
  -- ==========================================================================
  local root = createFullScreenContainer(nil, lvgl.OPA(0))      -- 全屏透明根容器
  local baseLayer = createFullScreenContainer(root)             -- 底层基底（时间数字 + 当前分钟底色）
  local wipeLayer = createFullScreenContainer(root)             -- 顶层擦除走秒层（时间数字 + 前一分钟底色，动态高度裁剪）

  -- 表驱动初始化 4 组时间数字（底层与顶层双份渲染，默认经典 10:08 ）
  local digits = {}
  for i, cfg in ipairs(DIGIT_CONFIGS) do
    local initialSrc = string.format(cfg.pattern, DEFAULT_DIGITS[i])
    digits[i] = {
      baseImg = Image(baseLayer, initialSrc, cfg.x, cfg.y),
      wipeImg = Image(wipeLayer, initialSrc, cfg.x, cfg.y),
      cfg = cfg,
      last = DEFAULT_DIGITS[i]
    }
  end

  -- ==========================================================================
  -- 运行时复用参数表（全链路 0 GC，杜绝垃圾回收停顿）
  -- ==========================================================================
  local imgSrcParam = { src = "" }
  local currentRecolorParam = { img_recolor = "" }
  local prevRecolorParam = { img_recolor = "" }
  local currentBgParam = { bg_color = "" }
  local prevBgParam = { bg_color = "" }
  local wipeHeightParam = { h = 0 }
  local wipeAnimParams = {
    run = true,
    duration = 1000,
    start_value = 0,
    end_value = 0
  }

  --- 细粒度增量更新时间数字贴图
  local function updateTimeText()
    for i = 1, 4 do
      local d = digits[i]
      local val = curTime[i]
      if d.last ~= val then
        imgSrcParam.src = imgPath(string.format(d.cfg.pattern, val))
        d.baseImg:set(imgSrcParam)
        d.wipeImg:set(imgSrcParam)
        d.last = val
      end
    end
  end

  --- 应用并刷新动态配色到所有图层与组件
  --- baseLayer (底层基底) 呈现当前分钟新配色；wipeLayer (顶层擦除) 呈现上一分钟旧配色
  local function changeColor()
    local minuteIndex = (curTime[1] * 10 + curTime[2]) * 60 + (curTime[3] * 10 + curTime[4])
    if minuteIndex == lastMinuteIndex then return end
    lastMinuteIndex = minuteIndex

    local prevMinuteIndex = (minuteIndex - 1 + 1440) % 1440
    local bgCurrent, fgCurrent = getMinutePalette(minuteIndex)
    local bgPrev, fgPrev = getMinutePalette(prevMinuteIndex)

    currentRecolorParam.img_recolor = fgCurrent
    prevRecolorParam.img_recolor = fgPrev
    for i = 1, 4 do
      digits[i].baseImg:set(currentRecolorParam)
      digits[i].wipeImg:set(prevRecolorParam)
    end

    currentBgParam.bg_color = bgCurrent
    prevBgParam.bg_color = bgPrev

    baseLayer:set(currentBgParam)
    wipeLayer:set(prevBgParam)
  end

  --- 提交并生效目标时间（状态严格同步，细粒度贴图差异刷新与色相重绘）
  --- @param h integer 小时 (0~23)
  --- @param m integer 分钟 (0~59)
  local function commitTime(h, m)
    curHour = h
    curMinute = m
    local h1, h2 = h // 10, h % 10
    local m1, m2 = m // 10, m % 10
    if curTime[1] ~= h1 or curTime[2] ~= h2 or curTime[3] ~= m1 or curTime[4] ~= m2 then
      curTime[1], curTime[2], curTime[3], curTime[4] = h1, h2, m1, m2
      updateTimeText()
      changeColor()
    end
  end

  --- 硬件时钟双路同步器（杜绝冷启动杂合帧与跨时错态）
  --- @param hour integer|nil 小时数值 (0~23)
  --- @param minute integer|nil 分钟数值 (0~59)
  local function onTimeReceive(hour, minute)
    if hour ~= nil then
      curHour = hour
      hasRealHour = true
    end
    if minute ~= nil then
      curMinute = minute
      hasRealMinute = true
    end

    -- 首轮冷启门禁：必须等硬件真实时分双路齐备，始单次原子提交真实时钟
    if not (hasRealHour and hasRealMinute) then
      return
    end
    commitTime(curHour, curMinute)
  end

  -- 走秒高度擦除动画：驱动 wipeLayer 高度裁剪（60 FPS 零 GC 内存分配，单目标极致高效）
  local secondWipeAnim = wipeLayer:Anim({
    run = false,
    start_value = 0,
    end_value = 0,
    duration = 1000,
    repeat_count = 1,
    path = "linear",
    exec_cb = function(obj, value)
      wipeHeightParam.h = value
      obj:set(wipeHeightParam)
    end
  })

  -- ==========================================================================
  -- 传感器与系统指标数据订阅 (dataman)
  -- 数据采用 Q24.8 定点数格式，低 8 位为小数位，高 24 位为整数值 (value // 256)
  -- ==========================================================================

  --- 解析 dataman 返回的 Q24.8 格式整数值
  --- @param value number 原始 Q24.8 定点数值
  --- @return integer|nil 提取的整数部分
  local function metricValue(value)
    if type(value) ~= "number" then return nil end
    return value // 256
  end

  -- 小时变化订阅 (绑定底层基底 baseLayer，组件销毁时自动退订)
  dataman.subscribe("timeHour", baseLayer, function(obj, value)
    local v = metricValue(value)
    if v and v >= 0 and v <= 23 then
      onTimeReceive(v, nil)
    end
  end)

  -- 分钟变化订阅 (绑定底层基底 baseLayer，组件销毁时自动退订)
  dataman.subscribe("timeMinute", baseLayer, function(obj, value)
    local v = metricValue(value)
    if v and v >= 0 and v <= 59 then
      onTimeReceive(nil, v)
    end
  end)

  -- 秒走针擦除动画订阅 (绑定顶层擦除走秒层 wipeLayer，组件销毁时自动退订)
  -- 专职驱动 60 FPS 走秒擦除动效；时间基准严守 timeHour / timeMinute 硬件广播，彻底杜绝双路时钟竞态
  local PIXELS_PER_SECOND = SCREEN_H / 60
  dataman.subscribe("timeSecond", wipeLayer, function(obj, value)
    local currentSecond = metricValue(value)
    if not currentSecond or currentSecond < 0 or currentSecond > 59 then return end

    local remainingSeconds = 59 - currentSecond

    -- ------------------------------------------------------------------------
    -- 【模式 A：60 FPS 平滑流转动画】
    -- ------------------------------------------------------------------------
    wipeAnimParams.start_value = math.floor((remainingSeconds + 1) * PIXELS_PER_SECOND + 0.5)
    wipeAnimParams.end_value = math.floor(remainingSeconds * PIXELS_PER_SECOND + 0.5)
    secondWipeAnim:set(wipeAnimParams)

    -- ------------------------------------------------------------------------
    -- 【模式 B：1 FPS 机械跳秒阶梯擦除】(备用方案：注释上面 3 行，解开下面 2 行即可)
    -- ------------------------------------------------------------------------
    -- wipeHeightParam.h = math.floor(remainingSeconds * PIXELS_PER_SECOND + 0.5)
    -- wipeLayer:set(wipeHeightParam)
  end)

  -- 首屏配色初始化（以 10:08 建立初始稳态）
  changeColor()
  return root
end

return entry()
