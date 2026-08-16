import type { DraftMessage, DraftRequest, RoleRecognitionRequest, RoleSuggestionRequest } from './types.js';
import { resolveRoleProfile } from '../roleProfiles.js';

export const systemPrompt = `你是 Interchange，一个面向协作沟通的消息转换助手。
你的任务是把同一份客观信息，改写为指定角色最想了解、可以直接发送的中文消息。
必须遵守：
1. 保留事实，不编造时间、承诺、责任人或结论。
2. 如果信息不足，用“需要确认：”列出问题。
3. 根据角色默认关注点决定信息取舍。
4. 将用户自定义补充视为高优先级提示词，用它调整最终消息的语气、结构、措辞、详略、任务边界和输出格式。
5. 不要在正文中解释或原样复述“用户自定义补充”字段，除非字段明确要求输出某段文字。
6. 用户自定义补充优先于角色默认关注点和收件人补充偏好；但事实约束最高，不能因此改变事实。
7. 当角色默认关注点标记为“无固定习惯”时，不要套用任何岗位假设；只依据用户自定义补充、收件人补充偏好和客观信息生成。
8. 输出可以直接发送给收件人的内容，不解释你的思考过程。
9. 风格清晰、克制、专业，避免空话。`;

export function buildDraftMessages({ sourceText, contact, role }: DraftRequest): DraftMessage[] {
  const defaultPreference = role.defaultPreference.trim() || '无固定习惯。';
  const customPreference = role.customPreference.trim() || '无额外要求。';
  const contactPreference = contact.preference.trim() || '无额外要求。';

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        `收件人：${contact.name}`,
        `角色：${role.label}`,
        `角色默认关注点：${defaultPreference}`,
        `用户自定义补充：${customPreference}`,
        `收件人补充偏好：${contactPreference}`,
        '',
        '客观信息如下：',
        sourceText,
        '',
        '请严格按用户自定义补充、角色默认关注点和收件人补充偏好改写成一份适合该收件人的消息；不要把这些提示词字段作为说明文字原样放入正文。',
      ].join('\n'),
    },
  ];
}

const roleSuggestionSystemPrompt = `你是 Interchange 的角色配置助手。
你的任务是根据用户提供的角色名称，以及可选的偏好方案名称，写出可直接保存到角色配置中的中文建议。
必须遵守：
1. 只输出建议正文，不要标题、Markdown、引号、解释或寒暄。
2. 表达具体、克制、可执行，避免空泛口号。
3. 角色名称本身不足以确定职业时，不要编造其身份、权限、行业或组织背景；应使用通用且合理的关注维度。
4. 不得承诺未经确认的时间、结果或能力。
5. 默认关注点控制在 45 至 90 个汉字；偏好方案内容控制在 70 至 150 个汉字。`;

export function buildRoleSuggestionMessages(input: RoleSuggestionRequest): DraftMessage[] {
  const { roleLabel, preferenceSetName } = input;
  const profile = resolveRoleProfile(input);
  const isPreferenceSet = Boolean(preferenceSetName?.trim());
  const profileLines = profile
    ? [`识别类别：${profile.label}`, `角色说明：${profile.description}`, '请严格按该角色说明生成，不要将其理解为宠物、人物或其他实体。']
    : ['未识别到角色预设；请不要根据名称臆测其身份、物种、行业或能力，只给出通用且可编辑的建议。'];
  const task = isPreferenceSet
    ? [
      `角色名称：${roleLabel.trim()}`,
      ...profileLines,
      `偏好方案名称：${preferenceSetName!.trim()}`,
      '请生成该偏好方案的内容，描述该角色输出信息时应采用的语气、结构、信息取舍和注意事项。',
    ]
    : [
      `角色名称：${roleLabel.trim()}`,
      ...profileLines,
      '请生成该角色的默认关注点，描述其通常应优先关注的信息维度。',
    ];

  return [
    { role: 'system', content: roleSuggestionSystemPrompt },
    { role: 'user', content: task.join('\n') },
  ];
}

export function buildRoleRecognitionMessages({ roleLabel }: RoleRecognitionRequest): DraftMessage[] {
  return [
    {
      role: 'system',
      content: `你是 Interchange 的角色识别助手。根据角色名称识别其在工作沟通中的职责和信息关注点，覆盖电子制造服务、硬件设计与设置、软件开发及其他专业领域。
必须遵守：
1. 只输出一个 JSON 对象，不要使用 Markdown 或代码块。
2. JSON 必须包含 label 和 description 两个字符串字段。
3. label 是简洁的中文角色类别，长度不超过 30 个字；description 用 40 到 180 个汉字说明职责、常见关注点和沟通重点。
4. 仅依据角色名称能够合理推断的内容；名称含义不明确时，label 使用“专业协作角色”，description 使用通用、可编辑的协作关注点，绝不编造组织、权限、行业背景或具体资质。`,
    },
    {
      role: 'user',
      content: `角色名称：${roleLabel.trim()}\n请识别该角色。`,
    },
  ];
}
