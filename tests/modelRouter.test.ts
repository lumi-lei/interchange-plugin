import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, type TextModelProviderName } from '../server/config.js';
import { generateDraft, generateRoleSuggestion, recognizeRole, resolveTextProvider } from '../server/ai/modelRouter.js';
import { deepSeekProvider } from '../server/ai/providers/deepseek.js';
import type { DraftRequest } from '../server/ai/types.js';

const originalProvider = config.textModelProvider;

describe('model router', () => {
  afterEach(() => {
    config.textModelProvider = originalProvider;
    vi.restoreAllMocks();
  });

  it('resolves the default text provider from config', () => {
    config.textModelProvider = 'deepseek';

    expect(resolveTextProvider()).toBe(deepSeekProvider);
  });

  it('normalizes explicit provider names', () => {
    expect(resolveTextProvider('deepseek')).toBe(deepSeekProvider);
    expect(resolveTextProvider('DEEPSEEK')).toBe(deepSeekProvider);
    expect(resolveTextProvider(' deepseek ')).toBe(deepSeekProvider);
  });

  it('throws a readable 503 error for unsupported text providers', () => {
    expect(() => resolveTextProvider('unknown-provider')).toThrow(
      'Unsupported TEXT_MODEL_PROVIDER "unknown-provider". Supported providers: deepseek.',
    );
    expect(() => resolveTextProvider('unknown-provider')).toThrow(expect.objectContaining({ status: 503 }));
  });

  it('generates drafts through the resolved text provider', async () => {
    config.textModelProvider = 'deepseek';
    const providerSpy = vi.spyOn(deepSeekProvider, 'generateDraft').mockResolvedValueOnce({ content: 'routed draft' });
    const input = sampleDraftRequest();

    await expect(generateDraft(input)).resolves.toBe('routed draft');
    expect(providerSpy).toHaveBeenCalledWith(input);
  });

  it('does not silently fall back for unsupported configured providers', async () => {
    config.textModelProvider = 'unknown-provider' as TextModelProviderName;

    await expect(generateDraft(sampleDraftRequest())).rejects.toMatchObject({
      status: 503,
      message: 'Unsupported TEXT_MODEL_PROVIDER "unknown-provider". Supported providers: deepseek.',
    });
  });

  it('generates role suggestions through the resolved text provider', async () => {
    config.textModelProvider = 'deepseek';
    const providerSpy = vi.spyOn(deepSeekProvider, 'generateRoleSuggestion').mockResolvedValueOnce({ content: '建议内容' });

    await expect(generateRoleSuggestion({ roleLabel: '豆包', preferenceSetName: '严肃点' })).resolves.toBe('建议内容');
    expect(providerSpy).toHaveBeenCalledWith({ roleLabel: '豆包', preferenceSetName: '严肃点' });
  });

  it('routes unmatched role recognition through the resolved text provider', async () => {
    config.textModelProvider = 'deepseek';
    const providerSpy = vi.spyOn(deepSeekProvider, 'recognizeRole').mockResolvedValueOnce({
      label: '硬件测试工程师',
      description: '关注测试覆盖、设备配置、异常定位与验证结论。',
    });

    await expect(recognizeRole({ roleLabel: '硬件测试工程师' })).resolves.toMatchObject({
      label: '硬件测试工程师',
    });
    expect(providerSpy).toHaveBeenCalledWith({ roleLabel: '硬件测试工程师' });
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
      preference: '',
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
