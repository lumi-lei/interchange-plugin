import { describe, expect, it } from 'vitest';
import { buildDraftMessages, buildRoleRecognitionMessages, buildRoleSuggestionMessages } from '../server/ai/prompts.js';
import type { DraftRequest } from '../server/ai/types.js';

describe('draft prompts', () => {
  it('builds a system and user message for draft generation', () => {
    const messages = buildDraftMessages(sampleDraftRequest());

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('includes the recipient, role preferences, contact preference, and source text', () => {
    const messages = buildDraftMessages(sampleDraftRequest());
    const userMessage = messages[1].content;

    expect(userMessage).toContain('收件人：AI');
    expect(userMessage).toContain('角色：我的 AI 编程工具');
    expect(userMessage).toContain('角色默认关注点：默认偏好：先给结论。');
    expect(userMessage).toContain('用户自定义补充：自定义偏好：补充风险。');
    expect(userMessage).toContain('收件人补充偏好：联系人偏好：少用术语。');
    expect(userMessage).toContain('变更：新增联系人管理。');
  });

  it('treats user supplements as rewrite instructions without fabricating facts', () => {
    const messages = buildDraftMessages(sampleDraftRequest());

    expect(messages[0].content).toMatch(/不编造|保留事实/);
    expect(messages[0].content).toContain('将用户自定义补充视为高优先级提示词');
    expect(messages[0].content).toContain('不要在正文中解释或原样复述“用户自定义补充”字段');
    expect(messages[0].content).toContain('事实约束最高');
    expect(messages[1].content).toContain('请严格按用户自定义补充、角色默认关注点和收件人补充偏好改写成一份适合该收件人的消息');
  });

  it('marks contact-only roles as having no fixed habit and uses their custom preference', () => {
    const request = sampleDraftRequest();
    request.contact.roleMode = 'custom';
    request.contact.roleKey = '';
    request.contact.customRoleLabel = '项目赞助人';
    request.contact.customRolePreference = '只汇报业务结论、风险与待决事项。';
    request.role = {
      ...request.role,
      key: 'contact_custom_1',
      label: request.contact.customRoleLabel,
      defaultPreference: '',
      customPreference: request.contact.customRolePreference,
    };

    const messages = buildDraftMessages(request);
    expect(messages[0].content).toContain('无固定习惯');
    expect(messages[1].content).toContain('角色：项目赞助人');
    expect(messages[1].content).toContain('角色默认关注点：无固定习惯。');
    expect(messages[1].content).toContain('用户自定义补充：只汇报业务结论、风险与待决事项。');
  });

  it('builds a focused prompt for a role default preference suggestion', () => {
    const messages = buildRoleSuggestionMessages({ roleLabel: '豆包' });

    expect(messages[0].content).toContain('只输出建议正文');
    expect(messages[1].content).toContain('角色名称：豆包');
    expect(messages[1].content).toContain('识别类别：通用 AI 助手');
    expect(messages[1].content).toContain('不要将其理解为宠物、人物或其他实体');
    expect(messages[1].content).toContain('默认关注点');
  });

  it('builds a focused prompt for a preference set suggestion', () => {
    const messages = buildRoleSuggestionMessages({ roleLabel: '豆包', preferenceSetName: '严肃点' });

    expect(messages[1].content).toContain('角色名称：豆包');
    expect(messages[1].content).toContain('偏好方案名称：严肃点');
    expect(messages[1].content).toContain('语气、结构、信息取舍和注意事项');
  });

  it('uses a custom description over an ambiguous role name', () => {
    const messages = buildRoleSuggestionMessages({
      roleLabel: '豆包',
      roleProfileKey: 'custom',
      roleProfileDescription: '面向软件开发任务，关注代码上下文、测试和验收。',
    });

    expect(messages[1].content).toContain('识别类别：自定义角色说明');
    expect(messages[1].content).toContain('代码上下文、测试和验收');
  });

  it('asks DeepSeek for structured professional-role recognition', () => {
    const messages = buildRoleRecognitionMessages({ roleLabel: 'SMT 工艺工程师' });

    expect(messages[0].content).toContain('电子制造服务、硬件设计与设置、软件开发');
    expect(messages[0].content).toContain('JSON');
    expect(messages[1].content).toContain('角色名称：SMT 工艺工程师');
  });
});

function sampleDraftRequest(): DraftRequest {
  return {
    sourceText: '变更：新增联系人管理。',
    contact: {
      id: 1,
      name: 'AI',
      roleKey: 'my_ai_coding_tool',
      roleMode: 'template',
      rolePreferenceId: null,
      customRoleLabel: '',
      customRolePreference: '',
      deliveryType: 'generic_webhook',
      webhookUrl: '',
      dingtalkSecret: '',
      dingtalkKeyword: '',
      preference: '联系人偏好：少用术语。',
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    role: {
      key: 'my_ai_coding_tool',
      label: '我的 AI 编程工具',
      defaultPreference: '默认偏好：先给结论。',
      customPreference: '自定义偏好：补充风险。',
      roleProfileKey: '',
      roleProfileDescription: '',
      usageCount: 0,
      preferenceSets: [],
      updatedAt: '',
    },
  };
}
