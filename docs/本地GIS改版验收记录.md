# 汛巡智眼 GIS 前端本地验收

验收日期：2026-10-09。基线：`main` / `b5d780e`。本轮仅修改本地工作区，未 commit、未 push、未部署。

## 实现范围

- 深蓝 GIS 主题，固定导航、区域横幅、任务／影像／风险三栏布局、下方流程时间线与人工处置。
- 任务配置／详情标签，六张可切换缩略图、原图对话框、实际图片分辨率、证据联动。
- 风险环显示返回的最高等级，不生成风险指数；风险事件、位置描述、置信度与建议保留原数据。
- 本地原创 SVG 河道与等高纹理，明确标注“区域示意 · 非实时地图 · 无定位数据”；不绘制虚构坐标、航迹或风险点。
- 新增上传期间任务锁定、上传直链变化后旧结果失效、非结构化研判错误状态；体验版自有图片仅预览，不套用预置识别结论。
- 真实网关未提供节点进度时不按计时器推进阶段；结构化结果返回后才将前三阶段标记完成。

## 文件

| 文件 | 作用 |
| --- | --- |
| `online-experience/ui.css` | 统一视觉、布局、状态与响应式 |
| `online-experience/ui.js` | 共用页面结构、导航、任务标签、缩略图、地图说明、流程呈现 |
| `online-experience/workspace.js` | 保留原审批约束，接入新组件与错误状态 |
| `online-experience/region-map.svg` | 原创本地区域示意资源 |
| `real-demo-server.mjs` | 提供 SVG 静态资源；纠正前端等待文案，不更改后端业务接口 |
| `tests/browser-acceptance.mjs` | 浏览器验收与截图，可独立运行 |
| `docs/前端设计与验收.md` | 更新设计与维护基线 |

## 测试证据

`npm test`：96 项通过，0 失败。

Edge 无头浏览器实际加载本地页面并完成：

- 1920×1080、1440×900、1280×800、390×844：无横向页面溢出，主图完整，缩略图可访问。
- 桥梁中风险、正常道路无风险、低清晰度待核验；切换素材清理旧研判与工单。
- 证据联动、原图放大／Escape 关闭、缩略图、减少动态效果。
- 空复核意见校验、提交意见、取消处置、生成工单、防重复、通过／驳回／退回复飞、撤销、意见锁定与操作记录。
- 本机图片预览；体验版明确拒绝将自有图片套用样例结果。
- 图片加载失败后恢复；真实入口的上传、请求失败、异常 JSON、非结构化复核、结构化复核恢复、工单失败与审批失败。

真实入口的浏览器 API 使用本地测试响应夹具，未连接真实智能体或真实 OSS 上传。本轮不证明校园网连通、平台实际识别质量、真实定位能力或 OSS 外网可用性。未发现阻断本地预置演示的已知问题。

截图存放在本地 `data/ui-acceptance/`（运行产物，Git 已忽略）：`workspace-1920.png`、`workspace-1440.png`、`workspace-1280.png`、`workspace-390.png`、`mobile-full.png`、`assessment-result.png`、`human-review.png`、`workorder-approval.png`、`image-error.png`、`mission-error.png`。

## 本地预览

运行 `npm run demo`（仅看预置体验且未配置密钥时可运行 `node real-demo-server.mjs`）。

- 预置案例：http://127.0.0.1:8789/experience/
- 真实调用：http://127.0.0.1:8789/

已有服务运行时刷新即可。修改服务端文件后需要重启；共享 CSS 与 JavaScript 由本地服务直接读取。

## 浏览器复验

脚本依赖外部安装的 `playwright-core`，不新增页面在线依赖。Windows PowerShell 示例：

```powershell
$env:PLAYWRIGHT_MODULE = "$env:TEMP\flood-browser-qa\node_modules\playwright-core"
$env:UI_SCREENSHOT_DIR = Join-Path (Get-Location).Path 'data\ui-acceptance'
node tests/browser-acceptance.mjs
```

当前本地安装路径用于本次验收；其他机器需将 `PLAYWRIGHT_MODULE` 指向自己的安装位置，并安装 Edge 或设置 `UI_BROWSER_CHANNEL`。

## 2026-10-10 地图与视觉精修

- 顶部与位置卡片替换为本地卫星风格地形底图；山体、道路、村落和自然河道有可辨识纹理。保留示意标识，不新增虚构事件坐标。
- 调整文字字体栈、正文层次、青色饱和度、卡片背景、缩略图边框和地图浮层。顶部支持放大、缩小、复位示意底图。
- 素材：`online-experience/terrain-satellite.png`。使用内置 imagegen 生成，非真实卫星数据，无外部瓦片依赖。
- 生成提示词：Photorealistic fictional orthographic satellite terrain, wide 3:1, broad winding blue-green river across center, forested hills, agricultural plots, villages, roads and a small bridge; detailed texture, subdued navy and forest green; no text, UI, labels or markers.
- 验证：npm test 96/96；浏览器四种尺寸与预置案例、上传、复核、模拟工单和审批测试通过。真实平台调用使用拦截夹具，未发起外部服务请求。
- 所有变更仍仅在本地，未 commit、push 或部署。
