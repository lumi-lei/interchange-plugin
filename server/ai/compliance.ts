import { config, DISABLED_EXTERNAL_MODEL_PROVIDER } from '../config.js';

export type ExternalModelKind = 'vision' | 'file';

export const disabledExternalModelMessages: Record<ExternalModelKind, string> = {
  vision: 'Vision model provider is not configured. This file was not sent to an external model.',
  file: 'File model provider is not configured. This file was not sent to an external model.',
};

function isProviderEnabled(providerName: string) {
  const normalizedProviderName = providerName.trim().toLowerCase();
  return Boolean(normalizedProviderName) && normalizedProviderName !== DISABLED_EXTERNAL_MODEL_PROVIDER;
}

export function isVisionProviderEnabled(providerName = config.visionModelProvider) {
  return isProviderEnabled(providerName);
}

export function isFileProviderEnabled(providerName = config.fileModelProvider) {
  return isProviderEnabled(providerName);
}

export function externalModelKindForSource(sourceType: string): ExternalModelKind {
  return sourceType === 'image' ? 'vision' : 'file';
}

export function assertExternalFileModelAllowed(kind: ExternalModelKind) {
  const enabled = kind === 'vision' ? isVisionProviderEnabled() : isFileProviderEnabled();
  if (enabled) return;

  const error = new Error(disabledExternalModelMessages[kind]);
  Object.assign(error, {
    status: 422,
    code: `${kind.toUpperCase()}_MODEL_PROVIDER_DISABLED`,
  });
  throw error;
}
