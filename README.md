# 汛巡智眼｜洪涝灾害无人机巡检救援 Agent

面向 AI+赛事赛道一的可运行演示项目。网页通过百炼平台已发布的智能体完成：

`无人机巡检图像（公网 URL） → jfg0 总控 → 任务规划 / jfg2 视觉识别 / RAG 风险研判 → 人工复核 → jfg4 模拟救援工单 → 最终人工审批闭环`

系统只生成模拟研判和模拟工单，**不执行真实派遣**。

## 队员快速启动（Windows）

### 1. 下载与安装

```powershell
git clone https://github.com/Ace-teng/Drone-inspection-and-rescue-for-flood-disasters.git
cd Drone-inspection-and-rescue-for-flood-disasters
Copy-Item .env.example .env.local
```

打开 `.env.local`，仅在本机填写自己取得的 `BAILIAN_APP_KEY`。该文件已被 Git 忽略，不能提交或发送到群聊。

### 2. 启动

双击 `启动演示.cmd`，或在终端运行：

```powershell
npm run demo
```

看到“真实演示页：http://127.0.0.1:8788”后，在浏览器打开该地址。

> 真实调用需要连接校园网，并且该百炼账号/密钥有调用 jfg0、jfg4 的权限。

## 使用演示页

1. 在左侧“测试素材（已配置公网 URL）”选择任一图片；网页会显示预览，并自动填写百炼可读取的公网图片 URL。
2. 点击“启动真实巡检研判”，等待 jfg0 依次完成任务规划、视觉识别、知识库风险研判。
3. 查看事件卡片与平台原始返回；填写人工意见后，可提交修改研判或确认生成模拟工单。
4. jfg4 生成待审批模拟工单后，选择“审批通过（模拟）”“驳回工单”或“退回复飞核验”。任意决定可撤销并重新审批。

## 项目结构

```text
├─ real-demo-server.mjs        # 本地网页与百炼真实调用服务
├─ run-demo.mjs                # 加载本机 .env.local 后启动服务
├─ 启动演示.cmd                 # Windows 双击启动器
├─ .env.example                # 仅字段示例，无任何真实密钥
├─ assets/test-images/         # 6 张测试图、来源授权说明、公网 URL 映射
├─ docs/                       # 队员协作与竞赛交付说明
└─ package.json                # Node 依赖与启动命令
```

## 测试素材与图片访问

`assets/test-images/` 包含 6 张用于演示的 JPG 和来源/授权说明。`public-image-urls.json` 保存已配置的 HTTPS 直链；网页选择器会自动使用这些 URL，因此百炼的 jfg2 视觉识别 Agent 能从公网读取图片。

已验证的真实调用示例：`03_flooded_road_high.jpg` 成功返回“道路积水、Ⅱ级风险、置信度 0.90、需人工复核”。队员验收步骤见 `docs/队员协作与验收说明.md`。

## 安全说明

- 不要把 `BAILIAN_APP_KEY`、`.env.local`、百炼账号密码、会话内容推送到 GitHub。
- 当前演示仅供竞赛模拟和辅助决策；不连接真实救援派遣系统。
- 公网测试图片用于演示；提交前若需要长期稳定复现，建议迁移到团队可控、公开读的 OSS 存储桶。
