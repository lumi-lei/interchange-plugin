# interchange-harness

本地优先的**角色化信息转化、知识沉淀与协同工具**，自包含的独立项目：Interchange 服务端 + Web 应用 + DeepSeek Harness 插件（模型工具 + 面板 + preset 技能）。

一次输入可核实的事实，即可按不同角色的关注点与偏好生成可审阅、可编辑的针对性信息；经人工确认后通过 Webhook/钉钉发送，并把开发变更沉淀为类 OpenSpec 的长期规范。

## 安装 DSH 插件

已发布的插件包名为 `interchange-dsh`。安装到 DSH Web profile：

```bash
dsh plugin --profile web add interchange-dsh
```

重启 DSH 后，在设置页打开「Interchange」并启动本地服务。独立安装模式会把 SQLite 数据和可选 `.env` 保存到 `~/.dsh/interchange/`；如需调用 DeepSeek，在该目录的 `.env` 中设置 `DEEPSEEK_API_KEY`。更多配置见 [`plugin/README.md`](plugin/README.md)。

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

前置条件（新设备）：

1. 安装 Node.js（≥ 22，建议最新 LTS）；
2. 安装并至少启动过一次 DeepSeek Harness（例如 `npx @deepseek-ai/dsh web`）——插件是 DSH 的扩展，本仓库不含 DSH 本身；
3. 本仓库已 `npm install` 并完成构建（见上节）。

```powershell
npm run install:dsh
# 等价于：powershell -ExecutionPolicy Bypass -File install.ps1
```

安装器会（**幂等，可重复运行**）：

1. 把 `plugin/` 部署到本机所有 DSH 安装位置（profile 与 npx 缓存）；
2. 在 `%DSH_HOME%\.agent-presets\interchange\` 生成/刷新「Interchange 协同」preset（含技能，自动写入真实工作区路径）；
3. 把宿主行写入 `%DSH_HOME%\profiles\web\cordis.patch.yml`（已存在则跳过；找不到补丁文件时打印片段供手工追加）。

默认工作区 = 本仓库自身目录；若仓库与服务分开部署，可指定：`install.ps1 -WorkspaceDir D:\other\path`。

然后：**重启 DSH** → **新建会话**选择「Interchange 协同」模式。

### 使用方式

- **会话内工具**（仅 Interchange 模式）：`interchange_status` / `_server_start` / `_server_stop`、`interchange_roles`、`interchange_contacts`、`interchange_parse`、`interchange_generate`、`interchange_send`（强制 `confirmed: true`）、`interchange_records` 等 12 个工具；
- **会话内技能**（仅 Interchange 模式）：`interchange-flow`（OpenSpec 类沉淀工作流）、`interchange-message-transformer`、`interchange-coding-context`、`interchange-human-confirmation` 等 7 个技能；
- **面板**（任何模式）：DSH 左下角侧栏「Interchange」按钮 → 会话窗口悬浮面板；设置页亦有「Interchange」分区。均可一键启停服务并内嵌 Web 应用。

### 配置

插件行的 `config.workspaceDir` 指向本项目根目录（安装器自动写入仓库自身路径；若仓库与服务分开部署，用 `install.ps1 -WorkspaceDir ...` 指定）。未配置时启动/解析操作会给出明确报错。

### 按角色限定 DSH 技能

DSH 里技能装得太多时，可以让**每个 Interchange 角色只启用一组技能**，避免误用不想要的技能：

1. 在 Web 应用「角色」页创建/编辑角色，打开「DSH 技能」区，勾选要启用的技能（默认只勾选内置的 7 个 interchange 技能，全局技能按需勾选）。
2. 保存角色后，服务端会自动在 `<DSH_HOME>/.agent-presets/<角色预设id>/` 生成同名 DSH 会话预设（默认 `~/.dsh/.agent-presets`，可用环境变量 `DSH_HOME` 或 `DSG_PRESETS_DIR` 覆盖）。预设固定包含完整工具集。
3. 在 DSH「新建会话」时选择该角色预设，会话就只挂载勾选的技能，并以该角色的名称与关注点作为 persona。
4. 删除角色会同步删除其预设目录；「角色列表」顶部的「重新生成全部预设」可一键重刷所有启用的角色预设。

生成的预设带 `interchange-role.json` 所有权标记，只会增删自己生成的目录，绝不覆盖或删除其它预设；改名会自动重建到新 id。

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

本项目采用 [MIT License](LICENSE)。
