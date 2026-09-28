import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { parseManifest } from "../xml";
import { compileWatchface, createCompileInput } from "./index";
import { getDeviceDefinition } from "../../device-definition";
import type { ProjectAsset } from "../model";

const EX2_RENDER_RULE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Watchface id="146255900595" name="@watchfaceName" width="432" height="514" SKU="false" compressMethod="RLEReversed" advanced="false" interactive="false" powerConsumptionLevel="1" support_literal="false" editable="true">
    <Resources>
        <Translation name="watchfaceName">
            <Item language="zh_CN" str="规则验证"/>
            <Item language="en_US" str="RuleVerify"/>
        </Translation>

        <!-- 素材引用 -->
        <Image name="icon_heart" src="faf6918.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>
        <Image name="icon_dot" src="icon_dot.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>
        <Image name="bar_fg" src="b158678.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>
        <Image name="bar_bg" src="1c8e789.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>
        <Image name="pointer_img" src="22b4902.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>

        <!-- 0-9 数字序列 (30x42) -->
        <ImageArray name="NumArray" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false">
            <Image src="num/0.png"/>
            <Image src="num/1.png"/>
            <Image src="num/2.png"/>
            <Image src="num/3.png"/>
            <Image src="num/4.png"/>
            <Image src="num/5.png"/>
            <Image src="num/6.png"/>
            <Image src="num/7.png"/>
            <Image src="num/8.png"/>
            <Image src="num/9.png"/>
        </ImageArray>

        <!-- 顶部总标题 -->
        <DataItemText name="Title_Main" align="left" w="432" h="24" fontId="misans" fontSize="18" color="#00E5FF" string="RENDER RULE VERIFY">
            <Content source="dateYear"/>
        </DataItemText>

        <!-- 1A: Widget Flex-Row 内温度互斥 -->
        <DataItemText name="Label_Grp1A" align="left" w="432" h="16" fontId="misans" fontSize="12" color="#00FF66" string="1A. WIDGET: [HEART] + [TEMP] + [C]">
            <Content source="dateYear"/>
        </DataItemText>
        <DataItemImageNumber name="Temp_C_Row" source="weatherCurrentTemperature" ref="@NumArray" totalDigits="2" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>
        <DataItemImageNumber name="Temp_F_Row" source="weatherCurrentTemperatureFahrenheit" ref="@NumArray" totalDigits="3" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>
        <DataItemText name="Text_Unit_C" align="left" w="24" h="38" fontId="misans" fontSize="24" color="#00FF66" string="C">
            <Content source="dateYear"/>
        </DataItemText>
        <Widget name="Widget_Row_Temp" flex_direction="row" justify_content="flex-start" align_items="center" gap="8" w="432" h="44">
            <Item ref="@icon_heart"/>
            <Item ref="@Temp_C_Row"/>
            <Item ref="@Temp_F_Row"/>
            <Item ref="@Text_Unit_C"/>
        </Widget>

        <!-- 1B: 绝对定位对照组 (当前温度) -->
        <DataItemText name="Label_Grp1B" align="left" w="432" h="16" fontId="misans" fontSize="12" color="#00FF66" string="1B. CURR TEMP: CELSIUS(L:SHOW) vs FAHR(R:HIDE)">
            <Content source="dateYear"/>
        </DataItemText>
        <DataItemImageNumber name="Temp_C_Abs" source="weatherCurrentTemperature" ref="@NumArray" totalDigits="2" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>
        <DataItemImageNumber name="Temp_F_Abs" source="weatherCurrentTemperatureFahrenheit" ref="@NumArray" totalDigits="3" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>

        <!-- 1C: 绝对定位对照组 (最高温) -->
        <DataItemText name="Label_Grp1C" align="left" w="432" h="16" fontId="misans" fontSize="12" color="#FFCC00" string="1C. MAX TEMP: CELSIUS(L:SHOW) vs FAHR(R:HIDE)">
            <Content source="dateYear"/>
        </DataItemText>
        <DataItemImageNumber name="Temp_Max_C_Abs" source="weatherTodayTemperatureMax" ref="@NumArray" totalDigits="2" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>
        <DataItemImageNumber name="Temp_Max_F_Abs" source="weatherTodayTemperatureMaxFahrenheit" ref="@NumArray" totalDigits="3" decimalDigits="0" leadingZero="false" renderRule="hideWhenUnitMismatch" align="left" space="1"/>

        <!-- 2: 进度条 OutRange 显隐测试 -->
        <DataItemText name="Label_Grp2" align="left" w="432" h="16" fontId="misans" fontSize="12" color="#FF66AA" string="2. PROG BATTERY: IN[0-100](L) vs OUT[0-5](R)">
            <Content source="dateYear"/>
        </DataItemText>
        <!-- 2A: 正常在区间内（[0, 100]） -->
        <DataItemArcProgressBar name="Prog_InRange" source="systemStatusBattery" ref="@bar_fg" bg="@bar_bg" endingStyle="round" valueStart="0" valueRange="100" angleStart="-90" angleRange="180" pivotX="100" pivotY="100" barWidth="16" barRadius="48" renderRule="hideWhenOutRange"/>
        <!-- 2B: 出界隐藏（[0, 5]，当前电量通常>5%） -->
        <DataItemArcProgressBar name="Prog_OutRange" source="systemStatusBattery" ref="@bar_fg" bg="@bar_bg" endingStyle="round" valueStart="0" valueRange="5" angleStart="-90" angleRange="180" pivotX="100" pivotY="100" barWidth="16" barRadius="48" renderRule="hideWhenOutRange"/>

        <!-- 3: 指针动态区间轮转（秒针 0~30s 与 30~60s 交替） -->
        <DataItemText name="Label_Grp3" align="left" w="220" h="16" fontId="misans" fontSize="12" color="#FF4444" string="3. SEC: 0-30s(L) / 30-60s(R)">
            <Content source="dateYear"/>
        </DataItemText>
        <!-- 前半分钟 0~30s 在左半圆到上半圆扫描 -->
        <DataItemPointer name="Pointer_Sec_First" source="timeSecond" ref="@pointer_img" valueStart="0" valueRange="30" angleStart="-90" angleRange="180" pivotX="8" pivotY="80" renderRule="hideWhenOutRange"/>
        <!-- 后半分钟 30~60s 在右半圆到下半圆扫描 -->
        <DataItemPointer name="Pointer_Sec_Second" source="timeSecond" ref="@pointer_img" valueStart="30" valueRange="30" angleStart="90" angleRange="180" pivotX="8" pivotY="80" renderRule="hideWhenOutRange"/>

        <!-- 4: 数字 ImageNumber (无 valueStart) 设 hideWhenOutRange 验证 -->
        <DataItemText name="Label_Grp4" align="left" w="200" h="16" fontId="misans" fontSize="12" color="#AAAAAA" string="4. NUM: OUT_RULE vs ALWAYS">
            <Content source="dateYear"/>
        </DataItemText>
        <DataItemImageNumber name="Num_Bat_OutRange" source="systemStatusBattery" ref="@NumArray" totalDigits="3" decimalDigits="0" leadingZero="false" renderRule="hideWhenOutRange" align="left" space="1"/>
        <DataItemImageNumber name="Num_Bat_Always" source="systemStatusBattery" ref="@NumArray" totalDigits="3" decimalDigits="0" leadingZero="false" renderRule="alwaysShow" align="left" space="1"/>

        <Image name="_preview_Style1_normal" src="_preview/_preview_Style1_normal.png" compressMethod="RLEReversed" format="RGBA32" recolorEnable="false"/>
    </Resources>
    
    <Theme type="normal" name="Style1" bgColor="#000000" preview="@_preview_Style1_normal">
        <!-- 顶部总标题 -->
        <Layout ref="@Title_Main" x="16" y="8"/>

        <!-- 组 1A: Widget 互斥 -->
        <Layout ref="@Label_Grp1A" x="16" y="36"/>
        <Layout ref="@Widget_Row_Temp" x="16" y="52"/>

        <!-- 组 1B: 绝对定位当前温度 -->
        <Layout ref="@Label_Grp1B" x="16" y="102"/>
        <Layout ref="@Temp_C_Abs" x="60" y="120"/>
        <Layout ref="@Temp_F_Abs" x="260" y="120"/>

        <!-- 组 1C: 绝对定位最高温 -->
        <Layout ref="@Label_Grp1C" x="16" y="172"/>
        <Layout ref="@Temp_Max_C_Abs" x="60" y="190"/>
        <Layout ref="@Temp_Max_F_Abs" x="260" y="190"/>

        <!-- 组 2: 进度条 OutRange -->
        <Layout ref="@Label_Grp2" x="16" y="242"/>
        <Layout ref="@Prog_InRange" x="20" y="246"/>
        <Layout ref="@Prog_OutRange" x="220" y="246"/>

        <!-- 组 3: 指针区间交替 -->
        <Layout ref="@Label_Grp3" x="16" y="380"/>
        <Layout ref="@Pointer_Sec_First" x="80" y="420"/>
        <Layout ref="@Pointer_Sec_Second" x="80" y="420"/>

        <!-- 组 4: 数字 OutRange 判定 -->
        <Layout ref="@Label_Grp4" x="220" y="380"/>
        <Layout ref="@Num_Bat_OutRange" x="230" y="400"/>
        <Layout ref="@Num_Bat_Always" x="320" y="400"/>
    </Theme>
</Watchface>
`;

describe("编译 ex2 表盘为 renderRule 真机验证包", () => {
  it("更新 manifest.xml 并生成 D:/WatchFace/ex2/resource.bin", async () => {
    const dir = "D:/WatchFace/ex2/resources";
    const xmlPath = path.join(dir, "manifest.xml");
    const bakPath = path.join(dir, "manifest.xml.bak");

    // 1. 备份
    if (!fs.existsSync(bakPath) && fs.existsSync(xmlPath)) {
      fs.copyFileSync(xmlPath, bakPath);
      console.log("Backed up original manifest to manifest.xml.bak");
    }

    // 2. 写入新 manifest.xml
    fs.writeFileSync(xmlPath, EX2_RENDER_RULE_XML, "utf8");
    console.log("Written renderRule test layout to manifest.xml");

    // 3. 解析与编译
    const parsed = parseManifest(EX2_RENDER_RULE_XML, "P65");
    if (!parsed.project) {
      throw new Error("Parse manifest failed: " + JSON.stringify(parsed.diagnostics));
    }
    const project = parsed.project;

    const assets: Record<string, ProjectAsset> = {};
    function readAssets(folder: string) {
      const full = path.join(dir, folder);
      if (!fs.existsSync(full)) return;
      for (const file of fs.readdirSync(full)) {
        const filePath = path.join(full, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          readAssets(folder ? `${folder}/${file}` : file);
        } else if (file.endsWith(".png")) {
          const key = folder ? `${folder}/${file}` : file;
          const normalizedKey = key.replace(/\\\\/g, "/");
          const buffer = fs.readFileSync(filePath);
          assets[normalizedKey] = {
            path: normalizedKey,
            url: "",
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
            blob: new Blob([buffer]),
            imageMetadataLoaded: true,
          };
        }
      }
    }
    readAssets("");
    project.assets = assets;
    console.log("Loaded assets count:", Object.keys(assets).length);

    const device = getDeviceDefinition("P65");
    const result = await compileWatchface(createCompileInput(project), { device });
    const outBin = "D:/WatchFace/ex2/resource.bin";
    fs.writeFileSync(outBin, Buffer.from(result.bytes));
    console.log(`Successfully compiled and written to ${outBin} (${result.size} bytes)`);
  });
});
