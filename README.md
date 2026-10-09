# 汛巡智眼｜洪涝灾害无人机巡检救援

## 在线体验版

仓库发布后可通过 GitHub Pages 访问在线体验页：

`https://ace-teng.github.io/Drone-inspection-and-rescue-for-flood-disasters/`

在线版复用本项目真实演示页面和完整交互闭环，使用预置巡检样例，因此不暴露 `BAILIAN_APP_KEY`、对象存储凭据或校园网内接口。真实智能体调用、上传对象存储与现场答辩，请按以下本地启动说明进行。

## 启动（Windows）

前提：安装 Node.js 18+，并连接校园网。

1. 下载本项目。
2. 在项目目录运行 `npm install`（安装对象存储 SDK `ali-oss`）。
3. 将 `.env.example` 复制并改名为 `.env.local`。
4. 在 `.env.local` 中填入百炼 `BAILIAN_APP_KEY`（不要上传此文件）。若未创建该文件，双击启动器时也可临时粘贴密钥。
5. 双击 `启动演示.cmd`。
6. 浏览器打开 `http://127.0.0.1:8789/`。

也可在终端运行：`npm run demo`。

## 本地前端预览

运行演示服务后，打开 `http://127.0.0.1:8789/experience/` 可体验预置案例，不需要校园网或智能体密钥；可以切换素材、查看放大影像、演示研判和模拟工单审批。若仅查看前端，可直接运行 `node real-demo-server.mjs`。

`http://127.0.0.1:8789/` 保留真实智能体调用，需要按上面的步骤配置密钥与网络。两种模式共用 `online-experience/ui.css`、`online-experience/ui.js` 和 `online-experience/workspace.js` 展示与交互层。

## 页面与队员版本不一致时

`npm run demo` 会显示项目目录、当前分支和提交号，以及真实调用和预置案例两个地址。队员最新界面在 `main` 分支；请先保存本地改动，再用 `git switch main` 和 `git pull --ff-only origin main` 同步。切换分支或更新服务代码后，停止旧服务再重新启动；仅刷新网页不会更新旧 Node 进程内的页面。

真实调用入口 `/` 与预置案例入口 `/experience/` 使用同一套前端。预置案例页右上角标明“在线体验版 · 预置示例”，可直接演示完整流程；真实调用页需要校园网和平台配置。若终端提示端口被占用，本次启动没有成功，此时该地址仍可能指向旧服务。

## 三种巡检图片来源

平台在另一台机器上，只能读取**公网可访问的图片直链**；本机 `127.0.0.1` 地址它读不到，所以这类链接会在调用平台之前就被拒绝。

1. **上传本机图片**（推荐）：选择 JPG/PNG → 点击“上传并作为巡检图片”→ 后端存入对象存储并把返回的直链填入“公网图片链接”。需要先配置对象存储，见 [docs/上传与对象存储配置.md](docs/上传与对象存储配置.md)。
2. **自带测试素材**：`assets/test-images/` 的 6 张图，选中即可在本页预览。清单 `assets/test-images/test-image-catalog.json` 里配置了长期直链的素材会自动填入链接；没有配置的只能预览，需要真实调用时请改用上传。
3. **自己填公网直链**：直接把任何公网可访问的 JPG/PNG 直链粘进“公网图片链接”。

> 不要使用临时图床（uguu.se、catbox 等）。这类直链几小时到几天就会过期，过期后平台读图静默失败。服务启动时会拒绝并告警这类链接。

## 环境变量

真实取值只写在不提交的 `.env.local`；`.env.example` 只列变量名和说明。密钥绝不能进入 HTML、前端 JS 或 Git。

| 变量 | 用途 |
| --- | --- |
| `BAILIAN_APP_KEY` | 智能体平台密钥（必填） |
| `PORT` | 演示端口，默认 8789 |
| `BAILIAN_API_BASE` | 覆盖智能体网关地址（本地测试用假网关时使用） |
| `DEMO_DEFAULT_IMAGE_URL` | 覆盖默认演示图片直链 |
| `DEMO_ALLOW_LOCAL_IMAGE_URLS` | 允许把本机地址当作图片直链提交（默认关闭） |
| `STORAGE_DRIVER` | `aliyun-oss` 或 `local`（本地联调） |
| `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS 配置，只放后端 |
| `OSS_PREFIX` / `OSS_ENDPOINT` / `OSS_CNAME` / `OSS_PUBLIC_BASE_URL` | 可选：对象前缀、自定义 endpoint、自定义域名、对外基础地址 |
| `UPLOAD_MAX_BYTES` | 单张图片上限，默认 8 MiB |

## 本地自动化测试

```
npm test
```

不需要密钥，不访问智能体平台，不访问外网（平台调用由内置假网关模拟）。覆盖素材清单、本地预览与路径穿越、上传校验与各类错误分支、模拟工单审批落盘，以及平台失败的分阶段诊断。

## 排查：调用失败时看 stage

失败信息统一带 `【stage】`、排查提示和非敏感诊断信息。常见 stage：

| stage | 含义 | 该找谁 |
| --- | --- | --- |
| `config.missing_key` | 本机没配 `BAILIAN_APP_KEY` | 自己补 `.env.local` |
| `input.invalid` | 缺任务描述/图片链接/会话号等 | 自己修输入 |
| `image.rejected` | 图片链接不可用（如本机地址） | 改用上传或公网直链 |
| `image.unreachable` | 图片链接返回 4xx/5xx（常见于过期图床） | 换图片 |
| `createSession.network` / `.timeout` | 连不上平台 | 检查校园网 |
| `createSession.rejected` | 平台拒绝建会话 | 看提示；若标注平台故障则等平台恢复 |
| `run.rejected` | 平台拒绝执行 | 看平台给出的原因 |
| `run.empty` | 平台返回成功但没有文本输出 | 先确认图片能无登录打开，再查工作流输出节点 |
| `upload.*` | 上传被本地校验或存储拒绝 | 按提示修文件或配置 |

被判定为平台侧故障时，信息里会明确写“平台侧故障（external blocker），本地代码与本机配置无需修改”。

## 目录

- `real-demo-server.mjs`：网页与平台真实调用
- `run-demo.mjs`：读取本机密钥并启动
- `启动演示.cmd`：双击启动
- `assets/test-images/`：6 张测试图、图片授权，以及素材清单 `test-image-catalog.json`
- `lib/`：路径、素材清单、平台调用诊断、对象存储与阿里云 OSS driver（都可单独测试）
- `tests/`：本地自动化测试（Node 内置 test runner，无第三方依赖）
- `docs/`：队员验收说明与上传配置说明

本系统只生成模拟研判与模拟工单，不执行真实救援派遣。
