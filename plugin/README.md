# interchange-dsh

Interchange 本地优先协同工具（角色化信息转化 / 知识沉淀 / 协同发送）的 **DeepSeek Harness（DSH）插件**。

- **宿主侧**（`host/`）：Interchange 本地服务（Express + SQLite，`127.0.0.1:4120`）的 sidecar 生命周期管理 + 面板 HTTP 桥 + `interchange_*` 模型工具。
- **浏览器侧**（`client/`）：设置页「Interchange」分区、会话侧栏入口按钮与可拖动悬浮面板（状态灯 / 一键启停 / 内嵌 Web 应用）。

## 安装与挂载

在 DSH 部署中把 `interchange-dsh` 加入插件依赖（`dsh` 客户段声明会使浏览器半区自动注入页面启动图），并配置两种挂载形态：

```yaml
# 宿主组合行（进程全局）：提供 interchangeServer 服务 + 面板桥
- id: interchange-dsh
  config:
    tools: false
    workspaceDir: 'D:/code/interchange-harness'  # 指向 interchange-harness 项目根目录
    apiBase: 'http://127.0.0.1:4120/api'
    appBase: 'http://127.0.0.1:4120'
```

```yaml
# Interchange preset 行（按会话）：只注册 interchange_* 模型工具，消费宿主行的服务
- id: interchange-dsh
  config:
    tools: true
```

`tools=false`（宿主行）与 `tools=true`（会话行）使用同一 `interchange-dsh` 包，由 `config.tools` 区分形态。

## 配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `tools` | `false` | `false` = 宿主组合行（服务 + 面板桥）；`true` = 会话工具行 |
| `workspaceDir` | `''` | interchange-harness 项目根目录（含 `server/`、`dist-server/`、`data/`、`.env`），服务运行所需 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | DSH 配置根目录，服务端据此定位 `.agent-presets` |
| `apiBase` | `http://127.0.0.1:4120/api` | 本地服务 API 地址 |
| `appBase` | `http://127.0.0.1:4120` | 内嵌 Web 应用地址 |
| `startTimeoutMs` | `30000` | 服务启动健康检查超时（毫秒） |

## 模型工具（`tools: true` 时注册）

- `interchange_status` / `interchange_server_start` / `interchange_server_stop` — 状态与生命周期
- `interchange_roles` / `interchange_preference_sets` / `interchange_role_presets` / `interchange_role_suggestions` — 角色与偏好方案
- `interchange_contacts` — 收件人（联系人、Webhook / 钉钉发送配置）
- `interchange_parse` — 文本 / 本地文件（Word/PDF/Excel/PPT/HTML/CSV/截图等）解析，原始文件仅本地处理
- `interchange_generate` — 按联系人生成角色化草稿（不自动发送）
- `interchange_send` — 发送关口：`confirmed: true` 才允许发送
- `interchange_records` — 生成与发送留痕查询

## 面板入口

- DSH 设置页 → 「Interchange」分区
- 会话窗口左下角侧栏按钮（状态灯 + 悬浮面板开关）

## License

[MIT](./LICENSE)