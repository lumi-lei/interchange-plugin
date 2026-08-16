# interchange-harness

本地优先的**角色化信息转化、知识沉淀与协同工具**，自包含的独立项目：Interchange 服务端 + Web 应用 + DeepSeek Harness 插件（模型工具 + 面板 + preset 技能）。

一次输入可核实的事实，即可按不同角色的关注点与偏好生成可审阅、可编辑的针对性信息；经人工确认后通过 Webhook/钉钉发送，并把开发变更沉淀为类 OpenSpec 的长期规范。

## 项目结构

```text
├── plugin/              # DeepSeek Harness 插件包 interchange-dsh
│   ├── host/            #   宿主半区：sidecar 生命周期 + /interchange-panel 桥 + interchange_* 工具
│   └── client/          #   浏览器半区：设置页分区 + 侧栏按钮 + 会话窗口悬浮面板
├── preset/              # 「Interchange 协同」preset 模板（安装时替换 __WORKSPACE_DIR__）
├── skills/ core/ scripts/   # 7 个 DSH 技能及配套文档/脚本（安装时随 preset 部署）
├── server/ api/         # Express + SQLite 服务端（角色/联系人/解析/生成/发送/记录）
├── src/                 # React Web 应用前端
├── tests/               # Vitest + Supertest 测试
├── install.ps1          # 一键部署到 DeepSeek Harness（Windows）
└── dist/ dist-server/   # 构建产物（npm run build / server:build，不入库）
```

## 快速开始（本地服务与 Web 应用）

```bash
npm install
copy .env.example .env   # 填入 DEEPSEEK_API_KEY
npm run server:build
npm run build
npm start               # 127.0.0.1:4120（API + Web 应用）
# 开发模式：npm run dev（前端 5173，代理 /api 到 4120）
```

文件解析（PPT/HTML/CSV）需要本机安装 MarkItDown：

```bash
python -m venv .venv
.venv\Scripts\pip install "markitdown[all]"
# .env: MARKITDOWN_COMMAND=D:\path\to\project\.venv\Scripts\markitdown.exe
```

docx/pdf/xlsx/截图 OCR 不依赖 MarkItDown。

## 接入 DeepSeek Harness

前置：本机已安装 DeepSeek Harness（`npx @deepseek-ai/dsh web` 可启动）。

```powershell
npm run install:dsh
# 等价于：powershell -ExecutionPolicy Bypass -File install.ps1
```

安装器会：

1. 把 `plugin/` 部署到 DSH 安装目录（profile 与 npx 缓存两种安装都会覆盖）；
2. 在 `%DSH_HOME%\.agent-presets\interchange\` 生成「Interchange 协同」preset（含技能）；
3. 打印需要追加到 `%DSH_HOME%\profiles\web\cordis.patch.yml` 的宿主行片段。

然后：**重启 DSH** → **新建会话**选择「Interchange 协同」模式。

### 使用方式

- **会话内工具**（仅 Interchange 模式）：`interchange_status` / `_server_start` / `_server_stop`、`interchange_roles`、`interchange_contacts`、`interchange_parse`、`interchange_generate`、`interchange_send`（强制 `confirmed: true`）、`interchange_records` 等 12 个工具；
- **会话内技能**（仅 Interchange 模式）：`interchange-flow`（OpenSpec 类沉淀工作流）、`interchange-message-transformer`、`interchange-coding-context`、`interchange-human-confirmation` 等 7 个技能；
- **面板**（任何模式）：DSH 左下角侧栏「Interchange」按钮 → 会话窗口悬浮面板；设置页亦有「Interchange」分区。均可一键启停服务并内嵌 Web 应用。

### 配置

插件行的 `config.workspaceDir` 指向本项目根目录（默认 `D:/code/interchange-harness`，安装时按 `install.ps1 -WorkspaceDir ...` 改写，或部署后直接编辑组合文件）。未配置时启动/解析操作会给出明确报错。

环境变量 `INTERCHANGE_WORKSPACE` 暂未使用；请通过 `-WorkspaceDir` 参数或编辑组合文件指定。

## 安全与数据边界

- 浏览器端不接触模型 API Key；密钥仅存于本项目 `.env`（已 gitignore）。
- 上传文件默认本地解析；原始附件不会上传给外部模型。
- 生成内容**不会自动发送**：必须经人工审阅确认（`interchange_send` 只接受 `confirmed: true`）。
- SQLite 数据存于 `data/interchange.sqlite`（gitignore），与 Web 应用共享。

## 测试

```bash
npm test
```

## 许可证

本项目尚未声明许可证。公开发布前请补充（例如 MIT），并注意 `skills/`、`core/`、`scripts/` 内容源自 Interchange 项目的 `agent-skills-v2` 目录。
