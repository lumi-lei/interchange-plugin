// 生成角色预设的 agent.cordis.yml 模板。行内容精简自 preset/agent.cordis.yml，
// 按勾选的工具组条件组装；skill-filesystem 固定 includeDefaultRoots: false +
// 只指向本预设的 skills/，从而不泄漏全局技能。
const PERSONA = (roleLabel, defaultPreference) => {
    const focus = defaultPreference.trim()
        ? `\n\n${roleLabel} 的关注点与偏好：${defaultPreference.trim()}`
        : '';
    return `You are a coding agent powered by the {{model}} model, working in the "${roleLabel}" role on the DeepSeek Harness. Your working directory is {{cwd}}.${focus}

Hard rules: facts stay facts — never invent owners, dates, commitments, or conclusions. Generated drafts are never sent automatically: show them to the user, wait for explicit confirmation, and only then call interchange_send with confirmed: true on every message. Uploaded files are parsed locally only.`;
};
const AGENT_INSTRUCTIONS = `- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536`;
const SHELL = `- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'

- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'`;
const FS = `- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false`;
const JOBS = `- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'`;
const SKILLS = `- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    includeDefaultRoots: false
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'`;
const GOALS = `- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'`;
const PLAN_MODE_SECTION = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`;
const PLANNING = `- id: planning
  name: cordis:group
  group: true
  isolate:
    planMode: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
${indent(PLAN_MODE_SECTION, 10)}`;
const COMPACTION = `- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'

    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'

    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024`;
function DELEGATION({ subagents, workflow, ralph }) {
    const rows = [];
    if (subagents) {
        rows.push(`    - id: tool-subagent-control
      name: '@deepseek-ai/dsh-tool-subagent-control'

    - id: tool-subagent-list-agents
      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'

    - id: tool-subagent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: subagent
        backgroundMode: continuable

    - id: tool-subagent-fork
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: fork
        toolName: subagent_fork
        backgroundMode: continuable`);
    }
    if (workflow) {
        rows.push(`    - id: workflow-worker-thread
      name: '@deepseek-ai/dsh-workflow-worker-thread'
      config:
        provider: spawn

    - id: tool-workflow
      name: '@deepseek-ai/dsh-tool-workflow'`);
    }
    if (ralph) {
        rows.push(`    - id: tool-ralph
      name: '@deepseek-ai/dsh-tool-ralph'
      config:
        subagentProvider: spawn
        maxRounds: 64`);
    }
    if (rows.length === 0)
        return '';
    return `- id: delegation
  name: cordis:group
  group: true
  isolate:
    workflowEngine: true
  config:
${rows.join('\n\n')}`;
}
const ASK_USER = `- id: tool-ask-user
  name: '@deepseek-ai/dsh-tool-ask-user'`;
const TODO = `- id: tool-todo
  name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true`;
const WEB = `- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000`;
function INTERCHANGE_TOOLS(workspaceDir) {
    return `- id: interchange-tools
  name: interchange-dsh
  config:
    tools: true
    workspaceDir: ${workspaceDir}`;
}
function indent(text, spaces) {
    const prefix = ' '.repeat(spaces);
    return text.split('\n').map((line) => prefix + line).join('\n');
}
export function renderAgentCordis(selection) {
    const blocks = [];
    blocks.push(`- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
${indent(PERSONA(selection.roleLabel, selection.defaultPreference), 6)}`);
    blocks.push(AGENT_INSTRUCTIONS);
    // 工具集固定完整：不再按角色勾选，所有生成的预设都带全部标准工具 + interchange 工具。
    blocks.push(SHELL);
    blocks.push(FS);
    blocks.push(JOBS);
    blocks.push(SKILLS);
    blocks.push(GOALS);
    blocks.push(PLANNING);
    blocks.push(COMPACTION);
    blocks.push(DELEGATION({ subagents: true, workflow: true, ralph: true }));
    blocks.push(ASK_USER);
    blocks.push(TODO);
    blocks.push(WEB);
    blocks.push(INTERCHANGE_TOOLS(selection.workspaceDir));
    return blocks.filter(Boolean).join('\n\n') + '\n';
}
export function renderPresetMeta(roleLabel, skillCount) {
    return `name: ${roleLabel}
description: 由 Interchange 角色「${roleLabel}」生成的会话预设：包含完整工具集，仅按技能限定为 ${skillCount} 个。在 DeepSeek Harness 新建会话时选择本预设即可按角色限定技能。`;
}
