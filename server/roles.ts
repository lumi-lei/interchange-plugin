export type RoleKey = string;

export type PreferenceTemplate = {
  key: string;
  name: string;
  content: string;
};

export type RoleFocusPreset = {
  key: string;
  label: string;
  aliases: string[];
  defaultPreference: string;
  preferenceTemplates?: PreferenceTemplate[];
};

export const legacyBuiltinRoleKeys = [
  'product',
  'qa',
  'tech_lead',
  'department_leader',
  'customer',
  'my_ai_coding_tool',
  'teammate_ai_coding_tool',
] as const;

const primaryAiCodingTemplate: PreferenceTemplate = {
  key: 'primary_ai_coding_workflow',
  name: '主执行 AI 编程工作流',
  content: [
    '你是当前任务的主执行 AI。请把输入内容转换成可直接交给 AI 编程软件执行的任务提示词。',
    '执行前置流程：使用本项目已封装的 Agent Skills 进入项目工作流；优先读取 AGENTS.md、OpenSpec 工作流说明、docs/ 下与任务相关的文档。',
    '如果任务缺少规格说明，先按 OpenSpec 工作流生成或补齐项目相关文档；未完成文档发现前，不要修改代码。',
    '动代码前必须先回复：已读取的 docs 文档、已读取或生成/更新的 OpenSpec 文档、本次任务边界、计划修改的文件、需要确认的问题。',
    '实现阶段只基于已读取文档和用户提供的客观信息，不扩展未确认需求，不扩大实现范围，不跳过测试和验收。',
  ].join('\n'),
};

const teammateAiCodingTemplate: PreferenceTemplate = {
  key: 'teammate_ai_coding_workflow',
  name: '协作 AI 编程工作流',
  content: [
    '你是同项目协作 AI。请把输入内容转换成可直接交给协作 AI 编程软件执行的协作提示词。',
    '执行前置流程：使用本项目已封装的 Agent Skills 进入项目工作流；优先读取 AGENTS.md、OpenSpec 工作流说明、docs/ 下与协作范围相关的文档。',
    '如果协作范围缺少规格说明，先按 OpenSpec 工作流生成或补齐项目相关文档；未完成文档发现前，不要修改代码。',
    '动代码前必须先回复：已读取的 docs 文档、已读取或生成/更新的 OpenSpec 文档、协作边界、依赖关系、计划修改的文件、需要确认的问题。',
    '不要重复主执行者的完整任务清单；优先指出接口契约、避免冲突的文件/模块、测试要求、合并注意事项和风险。',
    '实现阶段只基于已读取文档和用户提供的客观信息，不扩展未确认需求，不扩大实现范围，不跳过测试和验收。',
  ].join('\n'),
};

export const roleFocusPresets: RoleFocusPreset[] = [
  {
    key: 'product',
    label: '产品',
    aliases: ['产品经理', '产品负责人', '产品同学', 'PM'],
    defaultPreference: '关注用户价值、范围变化、交互影响、验收口径和是否需要调整需求文档。',
  },
  {
    key: 'qa',
    label: '测试',
    aliases: ['测试工程师', '质量保障', '质量工程师', 'QA'],
    defaultPreference: '关注测试范围、风险点、回归影响、验收步骤、边界条件和需要补充的测试数据。',
  },
  {
    key: 'tech_lead',
    label: '研发组长',
    aliases: ['技术负责人', '研发负责人', '开发组长', '技术主管', 'Tech Lead'],
    defaultPreference: '关注技术方案变化、影响模块、风险、依赖、排期影响和需要协调的工程决策。',
  },
  {
    key: 'department_leader',
    label: '部门领导',
    aliases: ['管理层', '部门负责人', '领导'],
    defaultPreference: '关注目标、进展、风险、资源诉求、对外承诺和业务影响，避免过多实现细节。',
  },
  {
    key: 'customer',
    label: '客户',
    aliases: ['客户方', '甲方', '用户'],
    defaultPreference: '关注可感知价值、交付时间、使用影响、注意事项和需要客户确认的问题。',
  },
  {
    key: 'my_ai_coding_tool',
    label: '我的 AI 编程软件',
    aliases: ['主执行 AI', '主执行AI', '我的 AI 编程助手', '我的AI编程助手'],
    defaultPreference: '关注可执行的开发上下文、文件/模块、约束、验收标准和下一步任务。',
    preferenceTemplates: [primaryAiCodingTemplate],
  },
  {
    key: 'teammate_ai_coding_tool',
    label: '同项目同事的 AI 编程软件',
    aliases: ['协作 AI', '协作AI', '同项目协作 AI', '同项目协作AI', '协作编程 AI'],
    defaultPreference: '关注客观事实、变更边界、接口契约、兼容性要求、测试要求和避免误改的注意事项。',
    preferenceTemplates: [teammateAiCodingTemplate],
  },
];

function normalizeRoleName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_\-—（）()[\]{}.,，。:：/\\]+/g, '');
}

export function findRoleFocusPresetByName(label: string) {
  const normalized = normalizeRoleName(label);
  if (!normalized) return null;
  return roleFocusPresets.find((preset) => [preset.label, ...preset.aliases]
    .some((alias) => normalizeRoleName(alias) === normalized)) ?? null;
}
