import OpenAI from 'openai';
import { config, requireDeepSeekKey } from '../../config.js';
import { buildDraftMessages, buildRoleRecognitionMessages, buildRoleSuggestionMessages } from '../prompts.js';
import type { DraftRequest, DraftResponse, RoleRecognitionRequest, RoleRecognitionResponse, RoleSuggestionRequest, TextModelProvider } from '../types.js';

export class DeepSeekProvider implements TextModelProvider {
  async generateDraft(input: DraftRequest): Promise<DraftResponse> {
    requireDeepSeekKey();
    const client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const completion = await client.chat.completions.create({
      model: config.deepseekModel,
      stream: false,
      messages: buildDraftMessages(input),
    });

    return { content: completion.choices[0]?.message?.content?.trim() ?? '' };
  }

  async generateRoleSuggestion(input: RoleSuggestionRequest): Promise<DraftResponse> {
    requireDeepSeekKey();
    const client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const completion = await client.chat.completions.create({
      model: config.deepseekModel,
      stream: false,
      messages: buildRoleSuggestionMessages(input),
    });

    return { content: completion.choices[0]?.message?.content?.trim() ?? '' };
  }

  async recognizeRole(input: RoleRecognitionRequest): Promise<RoleRecognitionResponse> {
    requireDeepSeekKey();
    const client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: 'https://api.deepseek.com',
    });

    const completion = await client.chat.completions.create({
      model: config.deepseekModel,
      stream: false,
      messages: buildRoleRecognitionMessages(input),
    });
    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const error = new Error('DeepSeek 未返回有效的角色识别结果，请稍后重试。');
      Object.assign(error, { status: 502 });
      throw error;
    }

    const label = typeof parsed === 'object' && parsed && 'label' in parsed ? String(parsed.label).trim() : '';
    const description = typeof parsed === 'object' && parsed && 'description' in parsed ? String(parsed.description).trim() : '';
    if (!label || !description || label.length > 80 || description.length > 400) {
      const error = new Error('DeepSeek 返回的角色识别结果不完整，请稍后重试。');
      Object.assign(error, { status: 502 });
      throw error;
    }
    return { label, description };
  }
}

export const deepSeekProvider = new DeepSeekProvider();
