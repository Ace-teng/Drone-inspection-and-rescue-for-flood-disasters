# 洪涝巡检 Demo 素材包

用途：用于“汛巡智眼”网页和 jfg0 总控工作流的首轮展示与验收。它是**演示/测试素材**，不是训练数据集；不要据此宣传模型准确率。

## 建议上传顺序与预期

| 文件 | 场景标签 | 建议预期输出 | 处理建议 |
| --- | --- | --- | --- |
| `01_bridge_debris_high.jpg` | 桥梁漂浮物/杂物堆积 | 高风险；桥梁或桥涵受堵风险；建议现场复核、警戒、清障 | 人工确认后可演示生成工单 |
| `02_bridge_debris_medium.jpg` | 低位桥梁附近漂浮物 | 中高风险；建议现场复核并关注泄洪断面 | 用于与 01 对比风险分级 |
| `03_flooded_road_high.jpg` | 道路被洪水淹没 | 中风险；通行受影响；建议绕行和持续复巡 | 不应自动创建救援工单 |
| `04_blurred_reflight_check.jpg` | 低清晰度桥梁图 | 低置信度；建议复飞复核 | 演示“系统不确定时不强行判定” |
| `05_normal_rural_road.jpg` | 正常乡村道路 | 未发现明显洪涝风险 | 演示低误报能力 |
| `06_normal_bridge.jpg` | 正常桥梁 | 未发现桥涵堵塞或结构异常 | 演示低误报能力 |

## 推荐测试话术

每张图片以同一任务输入测试：

> 请巡查 3 号桥、低洼村道和河道弯道，重点关注桥涵堵塞、道路积水与通行风险。请输出事件类型、位置、置信度、风险等级、知识库依据和处置建议；低置信度时仅建议复飞复核。

## 来源与授权

| 文件 | 原始来源 | 授权/署名要求 |
| --- | --- | --- |
| `01_bridge_debris_high.jpg` | [FEMA - Debris piled against a bridge in Iowa](https://commons.wikimedia.org/wiki/File:FEMA_-_36565_-_Debris_piled_against_a_bridge_in_Iowa.jpg) | PD US FEMA（公共领域）；建议在项目附录标注“Photo: Greg Henshall/FEMA”。 |
| `02_bridge_debris_medium.jpg` | [Debris on the low-level bridge over the Macquarie River](https://commons.wikimedia.org/wiki/File:Debris_on_the_low-level_bridge_over_the_Macquarie_River_in_Bathurst.jpg) | CC BY 2.0；署名 Ian Sutton，并附 CC BY 2.0 链接。 |
| `03_flooded_road_high.jpg` | [Flooded road at Great Swamp](https://commons.wikimedia.org/wiki/File:Flooded_road_at_Great_Swamp_(6097159338).jpg) | CC BY 2.0；署名 U.S. Fish and Wildlife Service - Northeast Region，并附 CC BY 2.0 链接。 |
| `04_blurred_reflight_check.jpg` | 由 `01_bridge_debris_high.jpg` 缩放、降对比度和模糊生成 | 与原图相同，使用时保留原图来源和说明“团队生成的低清晰度派生样例”。 |
| `05_normal_rural_road.jpg` | [Ruralroad.jpg](https://commons.wikimedia.org/wiki/File:Ruralroad.jpg) | 公共领域；作者 Bobvila2。 |
| `06_normal_bridge.jpg` | [Bridge over the Murray river](https://commons.wikimedia.org/wiki/File:Bridge_over_the_Murray_river.jpg) | 公共领域；作者 Andrew McMillan。 |

**答辩或策划书中的统一写法：**“测试素材来源于公共领域或 Creative Commons 授权公开图片；涉及 CC BY 图片均在附录标注作者、来源与许可证。本项目未使用素材训练模型。”

## 使用规则

1. 每次测试截图要同时保存：输入图片、Agent 原始输出、网页事件卡、人工操作结果。
2. `04_blurred_reflight_check.jpg` 的正确结果不是“识别桥涵堵塞”，而是“信息不足，建议复飞复核”。
3. 如果模型对 `05` 或 `06` 判为高风险，记录为误报，后续通过提示词和知识库规则改进。
