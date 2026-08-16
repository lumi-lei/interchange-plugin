import { config } from '../config.js';
import { deepSeekProvider } from './providers/deepseek.js';
import type { DraftRequest, RoleRecognitionRequest, RoleSuggestionRequest, TextModelProvider } from './types.js';

const textProviders: Record<string, TextModelProvider> = {
  deepseek: deepSeekProvider,
};

export function resolveTextProvider(providerName = config.textModelProvider): TextModelProvider {
  const normalizedProviderName = providerName.trim().toLowerCase();
  const provider = textProviders[normalizedProviderName];
  if (!provider) {
    const supported = Object.keys(textProviders).join(', ');
    const error = new Error(`Unsupported TEXT_MODEL_PROVIDER "${providerName}". Supported providers: ${supported}.`);
    Object.assign(error, { status: 503 });
    throw error;
  }
  return provider;
}

export async function generateDraft(input: DraftRequest) {
  const response = await resolveTextProvider().generateDraft(input);
  return response.content;
}

export async function generateRoleSuggestion(input: RoleSuggestionRequest) {
  const response = await resolveTextProvider().generateRoleSuggestion(input);
  return response.content;
}

export async function recognizeRole(input: RoleRecognitionRequest) {
  return resolveTextProvider().recognizeRole(input);
}
