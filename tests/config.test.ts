import { afterEach, describe, expect, it, vi } from 'vitest';

const CONFIG_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'TEXT_MODEL_PROVIDER',
  'VISION_MODEL_PROVIDER',
  'FILE_MODEL_PROVIDER',
  'LARGE_TEXT_LIMIT',
  'PORT',
  'SQLITE_PATH',
  'UPLOAD_LIMIT_MB',
  'RATE_LIMIT_WINDOW_MS',
  'API_RATE_LIMIT_MAX',
  'AI_RATE_LIMIT_MAX',
  'MARKITDOWN_COMMAND',
  'MARKITDOWN_TIMEOUT_MS',
  'DOTENV_CONFIG_PATH',
] as const;

const originalEnv = { ...process.env };

async function importConfigWithEnv(env: Record<string, string | undefined> = {}) {
  vi.resetModules();

  for (const key of CONFIG_ENV_KEYS) {
    delete process.env[key];
  }

  process.env.DOTENV_CONFIG_PATH = './.env.test-does-not-exist';
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return import('../server/config.js');
}

describe('server config', () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('uses the model adapter defaults when provider env vars are missing', async () => {
    const { config } = await importConfigWithEnv();

    expect(config.textModelProvider).toBe('deepseek');
    expect(config.visionModelProvider).toBe('none');
    expect(config.fileModelProvider).toBe('none');
    expect(config.deepseekApiKey).toBe('');
    expect(config.deepseekModel).toBe('deepseek-v4-flash');
    expect(config.largeTextLimit).toBe(30000);
    expect(config.uploadLimitMb).toBe(25);
    expect(config.markitdownCommand).toBe('markitdown');
    expect(config.markitdownTimeoutMs).toBe(15000);
    expect(config.rateLimitWindowMs).toBe(300000);
    expect(config.apiRateLimitMax).toBe(100);
    expect(config.aiRateLimitMax).toBe(3);
  });

  it('treats disabled external providers as unavailable with readable messages', async () => {
    await importConfigWithEnv();
    const {
      disabledExternalModelMessages,
      isFileProviderEnabled,
      isVisionProviderEnabled,
      assertExternalFileModelAllowed,
    } = await import('../server/ai/compliance.js');

    expect(isVisionProviderEnabled()).toBe(false);
    expect(isFileProviderEnabled()).toBe(false);
    expect(() => assertExternalFileModelAllowed('vision')).toThrow(disabledExternalModelMessages.vision);
    expect(() => assertExternalFileModelAllowed('file')).toThrow(disabledExternalModelMessages.file);
    expect(disabledExternalModelMessages.vision).toContain('not configured');
    expect(disabledExternalModelMessages.file).toContain('not configured');
  });

  it('throws a readable 503 when DEEPSEEK_API_KEY is missing without exposing secrets', async () => {
    const { config, requireDeepSeekKey } = await importConfigWithEnv({
      DEEPSEEK_API_KEY: 'sk-real-key-must-not-appear',
    });
    config.deepseekApiKey = '';

    expect(() => requireDeepSeekKey()).toThrow(expect.objectContaining({ status: 503 }));

    try {
      requireDeepSeekKey();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('DEEPSEEK_API_KEY');
      expect((error as Error).message).not.toContain('sk-real-key-must-not-appear');
    }
  });
});
