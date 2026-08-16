// interchange-dsh 浏览器半区：Interchange 面板（三入口共享一个状态 store）
//   1. settings.section —— 设置页「Interchange」分区（完整面板）
//   2. sidebar.footer.action —— 侧栏底部按钮（会话窗口常驻入口，带状态灯）
//   3. shell.overlay —— 会话窗口悬浮面板（可拖动，点击侧栏按钮开关）
// 经典脚本包（window.__ModuleLoader__ 工厂），由 /plugins/interchange-dsh/client.js 提供。
window.__ModuleLoader__.load({
  id: "interchange-dsh",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require("react")
    const { useState, useEffect, useSyncExternalStore, useRef } = React
    const h = React.createElement

    // ── 共享状态 store（状态/错误/忙碌 + 面板开关） ──────────────────────────
    let snap = { status: null, error: "", busy: "" }
    let polling = false
    const subs = new Set()
    const store = {
      subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
      getSnapshot() { return snap },
      set(patch) { snap = { ...snap, ...patch }; for (const fn of subs) fn() },
      async refresh() {
        try {
          const res = await fetch("/interchange-panel/status")
          const body = await res.json().catch(() => null)
          if (body !== null && typeof body === "object" && body.ok === false) throw new Error(body.error ?? "面板请求失败")
          if (!res.ok) throw new Error("HTTP " + res.status)
          store.set({ status: body?.data ?? null, error: "" })
        } catch (e) {
          store.set({ error: e && e.message ? e.message : String(e) })
        }
      },
      ensurePolling() {
        if (polling) return
        polling = true
        store.refresh()
        setInterval(() => { store.refresh() }, 8000)
      },
      async run(route) {
        store.set({ busy: route.indexOf("start") >= 0 ? "start" : "stop", error: "" })
        try {
          const res = await fetch(route, { method: "POST" })
          const body = await res.json().catch(() => null)
          if (body !== null && typeof body === "object" && body.ok === false) throw new Error(body.error ?? "面板请求失败")
          if (!res.ok) throw new Error("HTTP " + res.status)
          store.set({ status: body?.data ?? null, busy: "" })
        } catch (e) {
          store.set({ busy: "", error: e && e.message ? e.message : String(e) })
        }
      },
    }

    let openValue = false
    const openSubs = new Set()
    const openStore = {
      subscribe(fn) { openSubs.add(fn); return () => { openSubs.delete(fn) } },
      getSnapshot() { return openValue },
      toggle() { openValue = !openValue; for (const fn of openSubs) fn() },
    }

    const usePanel = () => useSyncExternalStore(store.subscribe, store.getSnapshot)

    // ── 主题同步：内嵌应用通过 ?theme= 与 DSH 界面保持一致 ────────────────────
    function parentTheme() {
      try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--dsw-alias-bg-panel").trim()
        const m = raw.match(/[\d.]+/g)
        if (m && m.length >= 3) {
          const [r, g, b] = m.slice(0, 3).map(Number)
          return (r * 299 + g * 587 + b * 114) / 1000 < 140 ? "dark" : "light"
        }
      } catch (e) { /* 主题不可探测时由应用回退到系统偏好 */ }
      return null
    }
    function appSrc(base) {
      const theme = parentTheme()
      if (!theme) return base
      return base + (base.indexOf("?") >= 0 ? "&" : "?") + "theme=" + theme
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    const V = {
      border: "var(--dsw-alias-border, #d1d5db)",
      fg: "var(--dsw-alias-fg, #111827)",
      muted: "var(--dsw-alias-fg-muted, #6b7280)",
      primary: "var(--dsw-alias-primary, #2f6fed)",
      panelBg: "var(--dsw-alias-bg-panel, #ffffff)",
    }
    const S = {
      dot: (color, size) => ({ width: size ?? 10, height: size ?? 10, borderRadius: 999, background: color, display: "inline-block", flex: "none" }),
      row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
      btn: {
        padding: "6px 14px", borderRadius: 8, border: "1px solid " + V.border,
        background: "transparent", color: V.fg, cursor: "pointer", fontSize: 13,
      },
      btnPrimary: {
        padding: "6px 14px", borderRadius: 8, border: "1px solid transparent",
        background: V.primary, color: "#ffffff", cursor: "pointer", fontSize: 13,
      },
      btnDisabled: { opacity: 0.5, cursor: "default" },
      table: { borderCollapse: "collapse", fontSize: 13 },
      th: { textAlign: "left", padding: "3px 14px 3px 0", fontWeight: 600, color: V.muted, whiteSpace: "nowrap" },
      td: { padding: "3px 14px 3px 0" },
      error: {
        padding: "8px 12px", borderRadius: 8, fontSize: 13,
        background: "rgba(220,38,38,0.08)", color: "#b91c1c", whiteSpace: "pre-wrap",
      },
      note: { fontSize: 12, color: V.muted, lineHeight: 1.6 },
      iframe: { border: "1px solid " + V.border, borderRadius: 10, width: "100%", background: "var(--dsw-alias-bg-panel, #f9fafb)", display: "block" },
      link: { color: V.primary, cursor: "pointer", fontSize: 13, background: "none", border: "none", padding: 0, textDecoration: "underline" },
    }

    function statusColor(status) {
      return status !== null && status.running === true ? "#16a34a" : "#9ca3af"
    }
    function statusLabel(status) {
      if (status === null) return "检测中…"
      return status.running === true ? "运行中" : "已停止"
    }

    // ── 面板主体（设置页与悬浮面板共用） ─────────────────────────────────────
    function PanelBody({ iframeHeight }) {
      const { status, error, busy } = usePanel()
      const [embed, setEmbed] = useState(false)
      const [iframeKey, setIframeKey] = useState(0)
      const running = status !== null && status.running === true
      const managed = status !== null && status.managedByPlugin === true

      return h("div", { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 860, padding: "2px 0 16px" } },
        h("div", { style: S.row },
          h("strong", null, "Interchange 本地协同服务"),
          h("span", { style: S.dot(statusColor(status)) }),
          h("span", null, statusLabel(status)),
          h("span", { style: S.note }, status ? String(status.apiBase ?? "127.0.0.1:4120") : "127.0.0.1:4120"),
        ),
        h("div", { style: S.row },
          h("button", {
            style: { ...S.btnPrimary, ...(busy !== "" || running ? S.btnDisabled : {}) },
            disabled: busy !== "" || running,
            onClick: () => store.run("/interchange-panel/start"),
          }, busy === "start" ? "启动中…" : "启动服务"),
          h("button", {
            style: { ...S.btn, ...(busy !== "" || !managed ? S.btnDisabled : {}) },
            disabled: busy !== "" || !managed,
            onClick: () => store.run("/interchange-panel/stop"),
          }, busy === "stop" ? "停止中…" : "停止服务"),
          h("button", {
            style: { ...S.btn, ...(!running ? S.btnDisabled : {}) },
            disabled: !running,
            onClick: () => window.open(status?.appBase ?? "http://127.0.0.1:4120", "_blank", "noopener"),
          }, "新标签页打开"),
          h("button", {
            style: { ...S.btn, ...(!running ? S.btnDisabled : {}) },
            disabled: !running,
            onClick: () => setEmbed((v) => !v),
          }, embed ? "收起内嵌应用" : "内嵌 Web 应用"),
        ),
        h("div", { style: S.note },
          !running
            ? "服务未运行。模型工具（interchange_*）会在需要时自动启动它；也可以在这里一键启停。"
            : managed
              ? "服务由本插件管理，可在这里停止；模型工具再次调用时会自动拉起。"
              : "服务由外部进程启动，本插件不会停止它——请在你启动它的终端里停止。"),
        h("table", { style: S.table },
          h("tbody", null,
            h("tr", null,
              h("th", { style: S.th }, "DeepSeek key"),
              h("td", { style: S.td }, status?.deepseekConfigured === true ? "已配置（/api/generate 可用）" : status?.deepseekConfigured === false ? "未配置（请在工作区 .env 配置）" : "—")),
            h("tr", null, h("th", { style: S.th }, "模型"), h("td", { style: S.td }, status?.model ?? "—")),
            h("tr", null,
              h("th", { style: S.th }, "进程管理"),
              h("td", { style: S.td }, status === null ? "检测中…" : running ? (managed ? "本插件管理" : "外部启动（不代为停止）") : "—")),
            h("tr", null, h("th", { style: S.th }, "工作区"), h("td", { style: S.td }, status?.workspaceDir ?? "D:\\code\\interchange")),
          )),
        error !== "" ? h("div", { style: S.error }, error) : null,
        embed && running
          ? h("iframe", {
              key: iframeKey,
              src: appSrc(status?.appBase ?? "http://127.0.0.1:4120"),
              style: { ...S.iframe, height: iframeHeight ?? 640 },
              allow: "clipboard-write",
              title: "Interchange Web 应用",
            })
          : null,
      )
    }

    // ── 入口 1：设置页分区 ───────────────────────────────────────────────────
    function SettingsPanel() {
      useEffect(() => { store.ensurePolling() }, [])
      return h(PanelBody, { iframeHeight: 640 })
    }

    // ── 入口 2：侧栏底部按钮 ─────────────────────────────────────────────────
    function SidebarAction(props) {
      const { status } = usePanel()
      useEffect(() => { store.ensurePolling() }, [])
      const wide = Boolean(props && props.wide)
      return h("button", {
        onClick: () => openStore.toggle(),
        title: "Interchange 面板（" + statusLabel(status) + "）",
        style: {
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "transparent", border: "none", color: V.fg,
          padding: "6px 8px", borderRadius: 8, fontSize: 13,
        },
      },
        h("span", { style: S.dot(statusColor(status), 9) }),
        wide ? h("span", null, "Interchange") : null)
    }

    // ── 入口 3：会话窗口悬浮面板（可拖动） ───────────────────────────────────
    function FloatingPanel() {
      const open = useSyncExternalStore(openStore.subscribe, openStore.getSnapshot)
      const { status } = usePanel()
      const [pos, setPos] = useState({ x: 0, y: 0 })
      const drag = useRef(null)
      useEffect(() => { store.ensurePolling() }, [])
      if (!open) return null
      return h("div", {
        style: {
          position: "fixed", right: 16, top: 16, width: 760, maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column",
          background: V.panelBg, border: "1px solid " + V.border, borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)", zIndex: 1000, pointerEvents: "auto",
          transform: "translate(" + pos.x + "px, " + pos.y + "px)", overflow: "hidden",
        },
      },
        h("div", {
          style: {
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderBottom: "1px solid " + V.border, cursor: "move", userSelect: "none",
            background: "var(--dsw-alias-bg-elevated, #f9fafb)",
          },
          onPointerDown: (e) => {
            if (e.target && e.target.closest && e.target.closest("button")) return
            drag.current = { sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y }
            e.currentTarget.setPointerCapture(e.pointerId)
          },
          onPointerMove: (e) => {
            if (drag.current === null) return
            setPos({ x: drag.current.bx + (e.clientX - drag.current.sx), y: drag.current.by + (e.clientY - drag.current.sy) })
          },
          onPointerUp: () => { drag.current = null },
          onPointerCancel: () => { drag.current = null },
        },
          h("strong", null, "Interchange"),
          h("span", { style: S.dot(statusColor(status)) }),
          h("span", { style: S.note }, statusLabel(status)),
          h("span", { style: { flex: 1 } }),
          h("button", {
            onClick: () => openStore.toggle(),
            onPointerDown: (e) => e.stopPropagation(),
            style: { ...S.btn, padding: "2px 10px" },
            title: "关闭面板",
          }, "×")),
        h("div", { style: { overflow: "auto", padding: "6px 16px 8px" } },
          h(PanelBody, { iframeHeight: 540 })),
      )
    }

    // ── 插件入口 ────────────────────────────────────────────────────────────
    function apply(ctx) {
      const slots = ctx.get("slots")
      if (slots === undefined) return
      slots.inject("settings.section", () => slots.register(
        { name: "settings.section", id: "interchange", order: 25, label: "Interchange" },
        () => h(SettingsPanel),
      ))
      slots.inject("sidebar.footer.action", () => slots.register(
        { name: "sidebar.footer.action", id: "interchange", order: 10, label: "Interchange" },
        (props) => h(SidebarAction, props),
      ))
      slots.inject("shell.overlay", () => slots.register(
        { name: "shell.overlay", id: "interchange", order: 0 },
        () => h(FloatingPanel),
      ))
    }

    exports.apply = apply
    exports.inject = ["slots"]
    return module.exports
  },
})
