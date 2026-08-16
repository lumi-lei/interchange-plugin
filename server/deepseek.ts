export type { DraftRequest } from './ai/types.js';
import { deepSeekProvider } from './ai/providers/deepseek.js';
import type { DraftRequest } from './ai/types.js';

export async function generateDraft(input: DraftRequest) {
  const response = await deepSeekProvider.generateDraft(input);
  return response.content;
}
