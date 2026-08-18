// interchange-dsh 宿主半区：Interchange 本地服务生命周期管理 + 面板 HTTP 桥 + interchange_* 模型工具。
//
// 两种挂载形态（由 config.tools 决定）：
// - tools=false（宿主组合行，进程全局）：provide `interchangeServer` 服务（sidecar 启停/健康检查/API 代理）
//   + 注册 /interchange-panel/* 同源 HTTP 桥（浏览器面板调用）。同时本包的 dsh.client 声明使
//   dsh-client-modules 把 ./client 包注入页面启动图。
// - tools=true（Interchange preset 行，按会话）：不 provide 任何服务，只把 interchange_* 工具
//   注册进本会话的工具层，消费宿主行的 interchangeServer 服务。

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

const name = 'interchange-dsh'
const PIDFILE_NAME = '.interchange-dsh.pid'

const Config = z.object({
  tools: z.boolean().default(false),
  // 指向 interchange-harness 项目根目录（含 server/、dist-server/、data/、.env）。
  // 未配置时，start/parse 等需要工作区的操作会给出明确报错；status 仍可查询。
  workspaceDir: z.string().default(''),
  // DeepSeek Harness 配置根目录；按角色生成会话预设时服务端据此定位 .agent-presets。
  // 留空时回退到 $DSH_HOME 或 ~/.dsh。
  dshHome: z.string().default(''),
  apiBase: z.string().default('http://127.0.0.1:4120/api'),
  appBase: z.string().default('http://127.0.0.1:4120'),
  startTimeoutMs: z.number().default(30000),
})

function resolveDshHome(config) {
  if (typeof config.dshHome === 'string' && config.dshHome.trim() !== '') return config.dshHome.trim()
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '') return process.env.DSH_HOME.trim()
  return path.join(homedir(), '.dsh')
}

function workspaceDir(config) {
  const dir = config.workspaceDir
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new Error('interchange-dsh: workspaceDir 未配置。请在插件行的 config 中把 workspaceDir 设为 interchange-harness 项目目录（例如 D:/code/interchange-harness）。')
  }
  return dir
}

// ── sidecar 管理器（仅宿主实例创建） ───────────────────────────────────────

function createManager(config, logger) {
  const state = { starting: null }
  const pidfilePath = () => path.join(config.workspaceDir, 'data', PIDFILE_NAME)
  const log = (message) => { try { logger?.warn(`interchange-dsh: ${message}`) } catch {} }

  async function readPidfile() {
    if (typeof config.workspaceDir !== 'string' || config.workspaceDir.trim() === '') return null
    try {
      const raw = await readFile(pidfilePath(), 'utf8')
      const parsed = JSON.parse(raw)
      return typeof parsed?.pid === 'number' ? parsed : null
    } catch {
      return null
    }
  }

  function isAlive(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error?.code === 'EPERM'
    }
  }

  async function health() {
    try {
      const res = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(3000) })
      const data = await res.json().catch(() => null)
      return { ok: res.ok, status: res.status, data }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  async function status() {
    const pf = await readPidfile()
    const managedByPlugin = pf !== null && isAlive(pf.pid)
    const h = await health()
    return {
      running: h.ok,
      apiBase: config.apiBase,
      appBase: config.appBase,
      workspaceDir: config.workspaceDir,
      managedByPlugin,
      pid: managedByPlugin ? pf.pid : null,
      deepseekConfigured: h.ok ? Boolean(h.data?.deepseekConfigured) : null,
      model: h.ok && typeof h.data?.model === 'string' ? h.data.model : null,
    }
  }

  async function start() {
    const current = await status()
    if (current.running) {
      return {
        ...current,
        alreadyRunning: true,
        message: current.managedByPlugin
          ? '服务已在运行（由本插件管理）。'
          : '服务已在运行（外部启动，本插件不会管理其停止）。',
      }
    }
    if (state.starting) return state.starting
    const dir = workspaceDir(config)
    const builtEntry = path.join(dir, 'dist-server', 'server', 'index.js')
    const tsxCli = path.join(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const devEntry = path.join(dir, 'server', 'index.ts')
    let commandArgs
    if (existsSync(builtEntry)) {
      commandArgs = [builtEntry]
    } else if (existsSync(tsxCli) && existsSync(devEntry)) {
      commandArgs = [tsxCli, 'server/index.ts']
    } else {
      throw new Error(`工作区缺少可运行的服务入口：请在 ${dir} 执行 npm install 并 npm run server:build（或保留 server/index.ts 与 tsx 依赖）。`)
    }
    state.starting = (async () => {
      const child = spawn(process.execPath, commandArgs, {
        cwd: dir,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, DSH_HOME: resolveDshHome(config) },
      })
      child.on('error', (error) => log(`服务进程启动失败: ${error.message}`))
      child.on('exit', () => { if (state.lastSpawned === child.pid) state.lastSpawned = null })
      state.lastSpawned = child.pid
      await mkdir(path.dirname(pidfilePath()), { recursive: true })
      await writeFile(pidfilePath(), JSON.stringify({ pid: child.pid, startedAt: Date.now() }))
      const deadline = Date.now() + config.startTimeoutMs
      let last = null
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        last = await health()
        if (last.ok) break
      }
      if (!last?.ok) {
        const detail = last?.status ? `HTTP ${last.status}` : '无法连接（进程可能已退出，请检查工作区日志或直接运行 npm run dev 排查）'
        throw new Error(`服务进程已启动（PID ${child.pid}）但健康检查超时：${detail}`)
      }
      return { ...(await status()), justStarted: true, message: '服务已启动。' }
    })().finally(() => { state.starting = null })
    return state.starting
  }

  async function stop() {
    const pf = await readPidfile()
    if (pf !== null && isAlive(pf.pid)) {
      try { process.kill(pf.pid) } catch {}
      for (let i = 0; i < 20; i++) {
        if (!isAlive(pf.pid)) break
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      await rm(pidfilePath(), { force: true })
      return { stopped: true, pid: pf.pid, message: `已停止服务（PID ${pf.pid}）。` }
    }
    await rm(pidfilePath(), { force: true })
    const h = await health()
    if (h.ok) {
      return { stopped: false, message: '服务正在运行但不是本插件启动的（外部管理）。请在你启动它的终端里停止，本插件不会误杀外部进程。' }
    }
    return { stopped: false, message: '服务未运行。' }
  }

  async function request(pathname, options = {}) {
    let res
    try {
      res = await fetch(config.apiBase + pathname, options)
    } catch (error) {
      throw new Error(`无法连接 Interchange 服务（${config.apiBase}）：${error?.message ?? String(error)}。请先调用 interchange_server_start 启动服务。`)
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { ok: res.ok, status: res.status, data }
  }

  return { status, start, stop, request, health }
}

// ── 面板 HTTP 桥（仅宿主实例） ─────────────────────────────────────────────

function registerBridge(ctx, webServer, manager) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: '/interchange-panel',
    handler: async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
      const route = pathname === '/interchange-panel' ? '/status' : pathname.slice('/interchange-panel'.length)
      const send = (code, payload) => {
        const body = JSON.stringify(payload)
        res.writeHead(code, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(body),
        })
        res.end(body)
      }
      try {
        let result
        if (route === '/status' && (req.method === 'GET' || req.method === 'HEAD')) result = await manager.status()
        else if (route === '/start' && req.method === 'POST') result = await manager.start()
        else if (route === '/stop' && req.method === 'POST') result = await manager.stop()
        else return send(404, { ok: false, error: `未知的面板路由 ${route}` })
        send(200, { ok: true, data: result })
      } catch (error) {
        send(200, { ok: false, error: error?.message ?? String(error) })
      }
    },
  })
  ctx.effect(() => dispose, 'interchange-dsh: panel bridge route')
}

// ── 模型工具（仅 preset 实例） ─────────────────────────────────────────────

function textTool(definition) {
  return defineTool({
    ...definition,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
  })
}

const json = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

function registerTools(ctx, config, server) {
  if (ctx.get('tools') === undefined) return

  const ensure = async () => {
    if (server === undefined) {
      throw new Error('interchange-dsh 宿主行未挂载（interchangeServer 服务缺失）。请确认部署的 cordis.patch.yml 包含 id 为 interchange-dsh 的宿主行并已重启 DSH。')
    }
    const current = await server.status()
    if (!current.running) await server.start()
    return server
  }

  const call = async (pathname, options) => {
    const s = await ensure()
    return s.request(pathname, options)
  }

  const jsonCall = async (pathname, options) => {
    const result = await call(pathname, options)
    if (!result.ok) {
      const message = result.data?.error ?? `HTTP ${result.status}`
      throw new Error(message)
    }
    return result.data
  }

  const tools = ctx.get('tools')

  // 状态与生命周期
  tools.register(textTool({
    name: 'interchange_status',
    description: '查看本地 Interchange 服务状态（是否运行、是否由插件管理、DeepSeek key 是否配置、Web 应用地址）。',
    parameters: {},
    timeoutMs: 15000,
    async execute() {
      if (server === undefined) return 'interchange-dsh 宿主行未挂载：请检查部署 cordis.patch.yml 并重启 DSH。'
      return json(await server.status())
    },
  }))

  tools.register(textTool({
    name: 'interchange_server_start',
    description: '启动本地 Interchange 服务（127.0.0.1:4120，Express + SQLite，复用工作区数据与 .env 中的 DeepSeek key）。已运行时只报告状态。',
    parameters: {},
    timeoutMs: 45000,
    async execute() {
      if (server === undefined) throw new Error('interchange-dsh 宿主行未挂载：请检查部署 cordis.patch.yml 并重启 DSH。')
      return json(await server.start())
    },
  }))

  tools.register(textTool({
    name: 'interchange_server_stop',
    description: '停止由本插件启动的本地 Interchange 服务；不停止用户手动启动的进程。',
    parameters: {},
    timeoutMs: 20000,
    async execute() {
      if (server === undefined) throw new Error('interchange-dsh 宿主行未挂载：请检查部署 cordis.patch.yml 并重启 DSH。')
      return json(await server.stop())
    },
  }))

  // 角色与偏好方案
  tools.register(textTool({
    name: 'interchange_roles',
    description: '管理 Interchange 角色：list（列出全部角色与偏好方案）、create（创建角色）、update（更新默认关注点）、delete（删除角色）。',
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | update | delete' },
      key: { type: 'string', description: '角色 key（update/delete 时必填）' },
      label: { type: 'string', description: '角色名称（create/update）' },
      defaultPreference: { type: 'string', description: '默认关注点/表达偏好（create/update）' },
      roleProfileKey: { type: 'string', description: '角色画像 key（create）' },
      roleProfileDescription: { type: 'string', description: '角色画像说明（create）' },
    },
    timeoutMs: 15000,
    async execute(args) {
      if (args.action === 'list') return json(await jsonCall('/roles'))
      if (args.action === 'create') {
        return json(await jsonCall('/roles', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            label: args.label,
            defaultPreference: args.defaultPreference ?? '',
            roleProfileKey: args.roleProfileKey ?? '',
            roleProfileDescription: args.roleProfileDescription ?? '',
          }),
        }))
      }
      if (!args.key) throw new Error('update/delete 需要提供 key')
      if (args.action === 'update') {
        const body = {}
        if (args.label !== undefined) body.label = args.label
        if (args.defaultPreference !== undefined) body.defaultPreference = args.defaultPreference
        if (args.roleProfileKey !== undefined) body.roleProfileKey = args.roleProfileKey
        if (args.roleProfileDescription !== undefined) body.roleProfileDescription = args.roleProfileDescription
        return json(await jsonCall(`/roles/${encodeURIComponent(args.key)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }))
      }
      if (args.action === 'delete') {
        const result = await call(`/roles/${encodeURIComponent(args.key)}`, { method: 'DELETE' })
        if (!result.ok && result.status !== 204) throw new Error(result.data?.error ?? `HTTP ${result.status}`)
        return '已删除。'
      }
      throw new Error('未知 action，仅支持 list | create | update | delete')
    },
  }))

  tools.register(textTool({
    name: 'interchange_preference_sets',
    description: '管理角色的可复用偏好方案：list / create（在角色下创建）/ update / delete。',
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | update | delete' },
      roleKey: { type: 'string', description: '角色 key（create 时必填）' },
      id: { type: 'integer', description: '偏好方案 id（update/delete 时必填）' },
      name: { type: 'string', description: '方案名称（create/update）' },
      content: { type: 'string', description: '方案内容（create/update）' },
    },
    timeoutMs: 15000,
    async execute(args) {
      if (args.action === 'list') {
        const roles = await jsonCall('/roles')
        const sets = []
        for (const role of roles ?? []) {
          for (const set of role.preferenceSets ?? []) sets.push({ ...set, roleKey: role.key, roleLabel: role.label })
        }
        return json(sets)
      }
      if (args.action === 'create') {
        if (!args.roleKey) throw new Error('create 需要 roleKey')
        return json(await jsonCall(`/roles/${encodeURIComponent(args.roleKey)}/preference-sets`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: args.name, content: args.content }),
        }))
      }
      if (!args.id) throw new Error('update/delete 需要 id')
      if (args.action === 'update') {
        const body = {}
        if (args.name !== undefined) body.name = args.name
        if (args.content !== undefined) body.content = args.content
        return json(await jsonCall(`/preference-sets/${args.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }))
      }
      if (args.action === 'delete') {
        const result = await call(`/preference-sets/${args.id}`, { method: 'DELETE' })
        if (!result.ok && result.status !== 204) throw new Error(result.data?.error ?? `HTTP ${result.status}`)
        return '已删除。'
      }
      throw new Error('未知 action，仅支持 list | create | update | delete')
    },
  }))

  tools.register(textTool({
    name: 'interchange_role_presets',
    description: '查看 Interchange 本地角色画像/角色关注点预设，或按角色名解析最匹配的预设（优先本地预设表，不消耗模型）。',
    parameters: {
      action: { type: 'string', required: true, description: 'profiles | focus-presets | resolve' },
      roleLabel: { type: 'string', description: '角色名（resolve 时必填）' },
    },
    timeoutMs: 15000,
    async execute(args) {
      if (args.action === 'profiles') return json(await jsonCall('/role-profiles'))
      if (args.action === 'focus-presets') return json(await jsonCall('/role-focus-presets'))
      if (args.action === 'resolve') {
        if (!args.roleLabel) throw new Error('resolve 需要 roleLabel')
        return json(await jsonCall('/role-profiles/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roleLabel: args.roleLabel }),
        }))
      }
      throw new Error('未知 action，仅支持 profiles | focus-presets | resolve')
    },
  }))

  tools.register(textTool({
    name: 'interchange_role_suggestions',
    description: '为角色生成可编辑的关注点或偏好方案建议（优先本地预设匹配，未命中才调用 DeepSeek）。',
    parameters: {
      roleLabel: { type: 'string', required: true, description: '角色名称' },
      preferenceSetName: { type: 'string', description: '偏好方案名称（生成偏好方案建议时提供）' },
      roleProfileKey: { type: 'string', description: '角色画像 key（可选，custom 时需配说明）' },
      roleProfileDescription: { type: 'string', description: '自定义角色画像说明（可选）' },
    },
    timeoutMs: 60000,
    async execute(args) {
      const body = { roleLabel: args.roleLabel }
      if (args.preferenceSetName !== undefined) body.preferenceSetName = args.preferenceSetName
      if (args.roleProfileKey !== undefined) body.roleProfileKey = args.roleProfileKey
      if (args.roleProfileDescription !== undefined) body.roleProfileDescription = args.roleProfileDescription
      return json(await jsonCall('/role-suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }))
    },
  }))

  // 联系人
  tools.register(textTool({
    name: 'interchange_contacts',
    description: '管理收件人（联系人，可绑定角色/偏好方案与 Webhook/钉钉发送配置）：list / create / update / delete / batch-active / delete-inactive。',
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | update | delete | batch-active | delete-inactive' },
      id: { type: 'integer', description: '联系人 id（update/delete 时必填）' },
      ids: { type: 'array', items: { type: 'integer' }, description: '联系人 id 列表（batch-active/delete-inactive 时必填）' },
      active: { type: 'boolean', description: '是否启用（batch-active 时必填）' },
      name: { type: 'string', description: '收件人名称（create/update）' },
      roleMode: { type: 'string', description: 'template | custom（create/update）' },
      roleKey: { type: 'string', description: '角色 key（create/update）' },
      rolePreferenceId: { type: 'integer', description: '偏好方案 id（create/update）' },
      customRoleLabel: { type: 'string', description: '自定义角色名（create/update）' },
      customRolePreference: { type: 'string', description: '联系人专属偏好（create/update）' },
      deliveryType: { type: 'string', description: 'generic_webhook | dingtalk_robot（create/update）' },
      webhookUrl: { type: 'string', description: 'Webhook 地址（create/update）' },
      dingtalkSecret: { type: 'string', description: '钉钉机器人签名密钥，仅服务端保存（create/update）' },
      dingtalkKeyword: { type: 'string', description: '钉钉机器人关键词（create/update）' },
      preference: { type: 'string', description: '备注/偏好（create/update）' },
    },
    timeoutMs: 15000,
    async execute(args) {
      if (args.action === 'list') return json(await jsonCall('/contacts'))
      if (args.action === 'create') {
        const body = {
          name: args.name,
          roleMode: args.roleMode ?? 'template',
          roleKey: args.roleKey ?? '',
          customRoleLabel: args.customRoleLabel ?? '',
          customRolePreference: args.customRolePreference ?? '',
          deliveryType: args.deliveryType ?? 'generic_webhook',
          webhookUrl: args.webhookUrl ?? '',
          dingtalkKeyword: args.dingtalkKeyword ?? '',
          preference: args.preference ?? '',
        }
        if (args.rolePreferenceId !== undefined) body.rolePreferenceId = args.rolePreferenceId
        if (args.dingtalkSecret !== undefined) body.dingtalkSecret = args.dingtalkSecret
        if (args.active !== undefined) body.active = args.active
        return json(await jsonCall('/contacts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }))
      }
      if (args.action === 'update') {
        if (!args.id) throw new Error('update 需要 id')
        const body = {}
        for (const key of ['name', 'roleMode', 'roleKey', 'customRoleLabel', 'customRolePreference', 'deliveryType', 'webhookUrl', 'dingtalkSecret', 'dingtalkKeyword', 'preference', 'active']) {
          if (args[key] !== undefined) body[key] = args[key]
        }
        if (args.rolePreferenceId !== undefined) body.rolePreferenceId = args.rolePreferenceId
        return json(await jsonCall(`/contacts/${args.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }))
      }
      if (args.action === 'delete') {
        if (!args.id) throw new Error('delete 需要 id')
        const result = await call(`/contacts/${args.id}`, { method: 'DELETE' })
        if (!result.ok && result.status !== 204) throw new Error(result.data?.error ?? `HTTP ${result.status}`)
        return '已删除。'
      }
      if (args.action === 'batch-active') {
        return json(await jsonCall('/contacts/batch/active', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: args.ids, active: Boolean(args.active) }),
        }))
      }
      if (args.action === 'delete-inactive') {
        return json(await jsonCall('/contacts/batch/inactive', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: args.ids }),
        }))
      }
      throw new Error('未知 action')
    },
  }))

  // 解析
  tools.register(textTool({
    name: 'interchange_parse',
    description: '把文本或本地文件（Word/PDF/Excel/PPT/HTML/CSV/截图等）解析为可编辑文本。文本走 text 参数；文件走 filePath（工作区内相对或绝对路径），原始文件仅本地解析、不会上传给外部模型。',
    parameters: {
      text: { type: 'string', description: '直接输入的文本（与 filePath 二选一）' },
      filePath: { type: 'string', description: '要解析的文件路径（与 text 二选一）' },
    },
    timeoutMs: 120000,
    async execute(args) {
      if (args.text !== undefined && args.text !== '') {
        const form = new FormData()
        form.append('text', args.text)
        return json(await jsonCall('/inputs/parse', { method: 'POST', body: form }))
      }
      if (args.filePath === undefined || args.filePath === '') throw new Error('text 与 filePath 必须提供一个')
      const resolved = path.isAbsolute(args.filePath) ? args.filePath : path.resolve(workspaceDir(config), args.filePath)
      let info
      try { info = await stat(resolved) } catch { throw new Error(`文件不存在：${resolved}`) }
      if (!info.isFile()) throw new Error(`不是文件：${resolved}`)
      if (info.size > 25 * 1024 * 1024) throw new Error(`文件超过 25MB 上限：${resolved}`)
      const buffer = await readFile(resolved)
      const form = new FormData()
      form.append('file', new Blob([buffer]), path.basename(resolved))
      return json(await jsonCall('/inputs/parse', { method: 'POST', body: form }))
    },
  }))

  // 生成
  tools.register(textTool({
    name: 'interchange_generate',
    description: '按已配置的联系人（角色/偏好方案）生成角色化草稿。草稿不会自动发送，必须经用户审阅；返回 generationRecordId 供后续发送引用。',
    parameters: {
      sourceText: { type: 'string', required: true, description: '客观事实原文（可核实的事实，不添加推断）' },
      contactIds: { type: 'array', items: { type: 'integer' }, required: true, description: '目标联系人 id 列表' },
      inputRecordId: { type: 'integer', description: '可选的解析记录 id（由 interchange_parse 返回）' },
    },
    timeoutMs: 180000,
    async execute(args) {
      const result = await jsonCall('/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceText: args.sourceText,
          contactIds: args.contactIds,
          inputRecordId: args.inputRecordId ?? null,
        }),
      })
      const drafts = (result.drafts ?? []).map((draft) => ({
        generationRecordId: draft.generationRecordId,
        contact: { id: draft.contact?.id, name: draft.contact?.name },
        role: draft.role,
        content: draft.content,
      }))
      return json({ drafts })
    },
  }))

  // 发送（强制人工确认关口）
  tools.register(textTool({
    name: 'interchange_send',
    description: '把用户已确认的消息通过 Webhook/钉钉发送给指定联系人。安全关口：每条消息都必须 confirmed=true；先向用户展示最终内容并获得明确确认（必要时用 ask_user_question 工具），否则本工具直接拒绝。',
    parameters: {
      messages: {
        type: 'array',
        required: true,
        description: '待发送消息列表',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            contactId: { type: 'integer', required: true, description: '联系人 id' },
            content: { type: 'string', required: true, description: '用户确认后的最终内容' },
            generationRecordId: { type: 'integer', description: '生成记录 id（可选，用于留痕关联）' },
            confirmed: { type: 'boolean', required: true, description: '必须为 true：用户已审阅并明确确认发送此内容' },
          },
        },
      },
    },
    timeoutMs: 60000,
    async execute(args) {
      const messages = args.messages ?? []
      if (messages.length === 0) throw new Error('messages 不能为空')
      for (const [index, message] of messages.entries()) {
        if (message.confirmed !== true) {
          throw new Error(`第 ${index + 1} 条消息未确认（confirmed 必须为 true）。请先向用户展示最终内容、取得明确发送确认后再调用本工具。`)
        }
      }
      return json(await jsonCall('/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((message) => ({
            generationRecordId: message.generationRecordId ?? null,
            contactId: message.contactId,
            content: message.content,
          })),
        }),
      }))
    },
  }))

  // 记录
  tools.register(textTool({
    name: 'interchange_records',
    description: '查询本地 SQLite 中最近的生成与发送记录（留痕）。',
    parameters: {},
    timeoutMs: 15000,
    async execute() {
      return json(await jsonCall('/records'))
    },
  }))

  // 使用指引（仅注入本会话）
  ctx.get('systemPrompt')?.section({
    name: 'interchange',
    order: 900,
    text: [
      '本会话启用 Interchange 本地协同工具集（角色化信息转化、知识沉淀、协同发送）。',
      '- 无配置的转化与沉淀：直接使用 interchange-message-transformer / interchange-coding-context / interchange-flow 等技能，用本模型完成，不需要服务。',
      '- 连接模式（角色/联系人/文件解析/DeepSeek 生成/发送留痕）：使用 interchange_* 工具；服务未运行时工具会自动启动 127.0.0.1:4120 的本地服务（数据在工作区 data/interchange.sqlite，与 Web 应用共享）。',
      '- 发送关口：interchange_send 只接受 confirmed=true 的消息；生成草稿后必须先向用户展示并取得明确确认，必要时使用 ask_user_question。',
      '- 界面入口：会话窗口左下角侧栏的 Interchange 按钮可打开悬浮面板（状态/一键启停/内嵌 Web 应用）；DSH 设置页也有「Interchange」分区。',
    ].join('\n'),
  })
}

// ── 插件入口 ───────────────────────────────────────────────────────────────

const inject = ['tools', 'systemPrompt', 'webServer']

function apply(ctx, config) {
  if (!config.tools) {
    const manager = createManager(config, ctx.logger)
    ctx.provide('interchangeServer', manager)
    const webServer = ctx.get('webServer')
    if (webServer !== undefined) registerBridge(ctx, webServer, manager)
    return
  }
  registerTools(ctx, config, ctx.get('interchangeServer'))
}

export { Config, apply, inject, name }
