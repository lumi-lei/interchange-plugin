import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDraftMessages, buildRoleRecognitionMessages, buildRoleSuggestionMessages } from '../server/ai/prompts.js';
import type { DraftRequest, TextModelProvider } from '../server/ai/types.js';

const createMock = vi.fn();
const constructorMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAIMock {
    chat = {
      completions: {
        create: createMock,
      },
    };

    constructor(options: unknown) {
      constructorMock(options);
    }
  },
}));

describe('DeepSeek provider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('implements the unified text model provider contract', async () => {
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const provider: TextModelProvider = deepSeekProvider;

    expect(provider).toHaveProperty('generateDraft');
    expect(typeof provider.generateDraft).toBe('function');
  });

  it('throws a readable 503 error when DEEPSEEK_API_KEY is missing', async () => {
    const { config } = await import('../server/config.js');
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const originalApiKey = config.deepseekApiKey;

    try {
      config.deepseekApiKey = '';

      try {
        await deepSeekProvider.generateDraft(sampleDraftRequest());
        throw new Error('Expected DeepSeek provider to reject without DEEPSEEK_API_KEY');
      } catch (error) {
        expect(error).toMatchObject({
          status: 503,
          message: expect.stringContaining('DEEPSEEK_API_KEY'),
        });
        expect((error as Error).message).not.toContain('sk-real-key-must-not-appear');
      }
      expect(constructorMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      config.deepseekApiKey = originalApiKey;
    }
  });

  it('calls DeepSeek through OpenAI-compatible chat completions with shared prompt messages', async () => {
    const { config } = await import('../server/config.js');
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const originalApiKey = config.deepseekApiKey;
    const originalModel = config.deepseekModel;

    try {
      config.deepseekApiKey = 'test-deepseek-key';
      config.deepseekModel = 'deepseek-v4-flash';
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '  生成内容  ' } }],
      });

      const response = await deepSeekProvider.generateDraft(sampleDraftRequest());

      expect(response).toEqual({ content: '生成内容' });
      expect(constructorMock).toHaveBeenCalledWith({
        apiKey: 'test-deepseek-key',
        baseURL: 'https://api.deepseek.com',
      });
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        model: 'deepseek-v4-flash',
        stream: false,
        messages: buildDraftMessages(sampleDraftRequest()),
      }));

      const request = createMock.mock.calls[0][0];
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].content).toContain('收件人：AI');
      expect(request.messages[1].content).toContain('角色：我的 AI 编程工具');
      expect(request.messages[1].content).toContain('角色默认关注点：偏好直接给出实现要点。');
      expect(request.messages[1].content).toContain('用户自定义补充：无额外要求。');
      expect(request.messages[1].content).toContain('收件人补充偏好：联系人偏好');
      expect(request.messages[1].content).toContain('变更：新增联系人管理。');
    } finally {
      config.deepseekApiKey = originalApiKey;
      config.deepseekModel = originalModel;
    }
  });

  it('returns an empty string when the provider response has no content', async () => {
    const { config } = await import('../server/config.js');
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const originalApiKey = config.deepseekApiKey;

    try {
      config.deepseekApiKey = 'test-deepseek-key';
      createMock.mockResolvedValueOnce({ choices: [{ message: {} }] });

      await expect(deepSeekProvider.generateDraft(sampleDraftRequest())).resolves.toEqual({ content: '' });
    } finally {
      config.deepseekApiKey = originalApiKey;
    }
  });

  it('generates a role configuration suggestion through the same DeepSeek client', async () => {
    const { config } = await import('../server/config.js');
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const originalApiKey = config.deepseekApiKey;

    try {
      config.deepseekApiKey = 'test-deepseek-key';
      createMock.mockResolvedValueOnce({ choices: [{ message: { content: '  关注任务目标、约束和验收标准。  ' } }] });

      await expect(deepSeekProvider.generateRoleSuggestion({ roleLabel: '豆包' })).resolves.toEqual({
        content: '关注任务目标、约束和验收标准。',
      });
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        messages: buildRoleSuggestionMessages({ roleLabel: '豆包' }),
      }));
    } finally {
      config.deepseekApiKey = originalApiKey;
    }
  });

  it('recognizes an unmatched professional role with structured DeepSeek output', async () => {
    const { config } = await import('../server/config.js');
    const { deepSeekProvider } = await import('../server/ai/providers/deepseek.js');
    const originalApiKey = config.deepseekApiKey;

    try {
      config.deepseekApiKey = 'test-deepseek-key';
      createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        label: 'SMT 工艺工程师',
        description: '关注贴片工艺参数、良率、缺陷闭环、产线变更与验证。',
      }) } }] });

      await expect(deepSeekProvider.recognizeRole({ roleLabel: 'SMT 工艺工程师' })).resolves.toEqual({
        label: 'SMT 工艺工程师',
        description: '关注贴片工艺参数、良率、缺陷闭环、产线变更与验证。',
      });
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        messages: buildRoleRecognitionMessages({ roleLabel: 'SMT 工艺工程师' }),
      }));
    } finally {
      config.deepseekApiKey = originalApiKey;
    }
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
      preference: '联系人偏好',
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    role: {
      key: 'my_ai_coding_tool',
      label: '我的 AI 编程工具',
      defaultPreference: '偏好直接给出实现要点。',
      customPreference: '',
      roleProfileKey: '',
      roleProfileDescription: '',
      usageCount: 0,
      preferenceSets: [],
      updatedAt: '',
    },
  };
}
