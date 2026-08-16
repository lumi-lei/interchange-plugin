export type RoleProfile = {
  key: string;
  label: string;
  aliases: string[];
  description: string;
};

export const roleProfiles: RoleProfile[] = [
  {
    key: 'general_ai_assistant',
    label: '通用 AI 助手',
    aliases: ['豆包', 'doubao', 'chatgpt', 'claude', 'gemini', 'kimi', '通义千问', 'qwen', '文心一言', 'deepseek'],
    description: '面向任务理解、信息整理、分析判断和执行建议的通用 AI 助手。',
  },
  {
    key: 'ai_coding_assistant',
    label: 'AI 编程助手',
    aliases: ['codex', 'cursor', 'copilot', 'github copilot', 'windsurf', 'trae', 'codebuddy'],
    description: '面向软件开发任务的 AI 助手，重点关注代码上下文、实现边界、接口、测试和验收。',
  },
  {
    key: 'design_collaboration_tool',
    label: '设计协作工具',
    aliases: ['figma', 'axure', 'sketch'],
    description: '面向产品与设计协作，重点关注交互流程、视觉规范、设计资产和交付说明。',
  },
  {
    key: 'api_debugging_tool',
    label: 'API 调试工具',
    aliases: ['postman', 'apifox', 'swagger'],
    description: '面向接口设计与调试，重点关注接口契约、请求响应、鉴权、测试数据和异常场景。',
  },
  {
    key: 'project_management_tool',
    label: '项目管理工具',
    aliases: ['jira', '禅道', 'tapd'],
    description: '面向项目协作与跟踪，重点关注事项、优先级、进度、阻塞、责任人与下一步行动。',
  },
];

export type ResolvedRoleProfile = Pick<RoleProfile, 'key' | 'label' | 'description'> & {
  source: 'preset' | 'deepseek' | 'custom';
};

function normalizeRoleName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_\-—（）()[\]{}.,，。:：/\\]+/g, '');
}

export function findRoleProfileByKey(key: string) {
  return roleProfiles.find((profile) => profile.key === key.trim()) ?? null;
}

export function findRoleProfileByName(label: string) {
  const normalized = normalizeRoleName(label);
  if (!normalized) return null;
  return roleProfiles.find((profile) => [profile.label, ...profile.aliases].some((alias) => normalizeRoleName(alias) === normalized)) ?? null;
}

export function resolveRoleProfile(input: {
  roleLabel: string;
  roleProfileKey?: string;
  roleProfileDescription?: string;
}): ResolvedRoleProfile | null {
  const key = input.roleProfileKey?.trim() ?? '';
  const description = input.roleProfileDescription?.trim() ?? '';

  if (key === 'custom') {
    return description ? { key, label: '自定义角色说明', description, source: 'custom' } : null;
  }

  if (key === 'deepseek') {
    return description ? { key, label: 'DeepSeek 识别角色', description, source: 'deepseek' } : null;
  }

  const matched = findRoleProfileByName(input.roleLabel);
  return matched ? { ...matched, source: 'preset' } : null;
}
