import 'dotenv/config';
import path from 'node:path';

const root = process.cwd();
const defaultSqlitePath = path.resolve(root, './data/interchange.sqlite');

export const DISABLED_EXTERNAL_MODEL_PROVIDER = 'none' as const;
export type TextModelProviderName = 'deepseek' | (string & {});
export type ExternalModelProviderName = typeof DISABLED_EXTERNAL_MODEL_PROVIDER | (string & {});

function providerEnv(value: string | undefined, fallback: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 4120),
  sqlitePath: process.env.SQLITE_PATH ? path.resolve(root, process.env.SQLITE_PATH) : defaultSqlitePath,
  tursoDatabaseUrl: process.env.TURSO_DATABASE_URL?.trim() ?? '',
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN?.trim() ?? '',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  textModelProvider: (process.env.TEXT_MODEL_PROVIDER ?? 'deepseek') as TextModelProviderName,
  visionModelProvider: providerEnv(process.env.VISION_MODEL_PROVIDER, DISABLED_EXTERNAL_MODEL_PROVIDER) as ExternalModelProviderName,
  fileModelProvider: providerEnv(process.env.FILE_MODEL_PROVIDER, DISABLED_EXTERNAL_MODEL_PROVIDER) as ExternalModelProviderName,
  largeTextLimit: Number(process.env.LARGE_TEXT_LIMIT ?? 30000),
  uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB ?? 25),
  markitdownCommand: process.env.MARKITDOWN_COMMAND ?? 'markitdown',
  markitdownTimeoutMs: Number(process.env.MARKITDOWN_TIMEOUT_MS ?? 15000),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 300000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX ?? 100),
  aiRateLimitMax: Number(process.env.AI_RATE_LIMIT_MAX ?? 3),
  roleRecognitionRateLimitMax: Number(process.env.ROLE_RECOGNITION_RATE_LIMIT_MAX ?? 20),
};

export function requireDeepSeekKey() {
  if (!config.deepseekApiKey) {
    const error = new Error('DEEPSEEK_API_KEY is not configured. Add it to .env before generating AI drafts.');
    Object.assign(error, { status: 503 });
    throw error;
  }
}
