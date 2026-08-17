# 汛巡智眼｜洪涝灾害无人机巡检救援

## 启动（Windows）

前提：安装 Node.js 18+，并连接校园网。

1. 下载本项目。
2. 将 `.env.example` 复制并改名为 `.env.local`。
3. 在 `.env.local` 中填入百炼 `BAILIAN_APP_KEY`（不要上传此文件）。若未创建该文件，双击启动器时也可临时粘贴密钥。
4. 双击 `启动演示.cmd`。
5. 浏览器打开 `http://127.0.0.1:8789/`。

也可在终端运行：`npm run demo`。

选择测试图片后，网页会在本地预览该素材；如果 `assets/test-images/test-image-catalog.json` 里为该素材配置了长期有效的公网直链，也会自动填入“公网图片链接”。点击“启动真实巡检研判”即可运行 jfg0、jfg2 和 jfg4 流程。

平台需要公网可访问的图片直链，本机 `127.0.0.1` 地址读不到，所以真实调用必须填写自有对象存储直链或其他公网直链。可用环境变量 `DEMO_DEFAULT_IMAGE_URL` 覆盖默认演示图片。

运行本地自动化测试（不需要密钥、不访问百炼平台）：`npm test`。

## 保留内容

- `real-demo-server.mjs`：网页与百炼真实调用
- `run-demo.mjs`：读取本机密钥并启动
- `启动演示.cmd`：双击启动
- `assets/test-images/`：6 张测试图、图片授权，以及素材清单 `test-image-catalog.json`
- `lib/`：素材清单读取等可单独测试的模块
- `tests/`：本地自动化测试（Node 内置 test runner，无第三方依赖）
- `docs/`：队员验收说明

本系统只生成模拟研判与模拟工单，不执行真实救援派遣。
