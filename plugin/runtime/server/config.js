import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
const root = process.cwd();
const defaultSqlitePath = path.resolve(root, './data/interchange.sqlite');
const defaultDshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
export const DISABLED_EXTERNAL_MODEL_PROVIDER = 'none';
function providerEnv(value, fallback) {
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
    textModelProvider: (process.env.TEXT_MODEL_PROVIDER ?? 'deepseek'),
    visionModelProvider: providerEnv(process.env.VISION_MODEL_PROVIDER, DISABLED_EXTERNAL_MODEL_PROVIDER),
    fileModelProvider: providerEnv(process.env.FILE_MODEL_PROVIDER, DISABLED_EXTERNAL_MODEL_PROVIDER),
    largeTextLimit: Number(process.env.LARGE_TEXT_LIMIT ?? 30000),
    uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB ?? 25),
    markitdownCommand: process.env.MARKITDOWN_COMMAND ?? 'markitdown',
    markitdownTimeoutMs: Number(process.env.MARKITDOWN_TIMEOUT_MS ?? 15000),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 300000),
    apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX ?? 100),
    aiRateLimitMax: Number(process.env.AI_RATE_LIMIT_MAX ?? 3),
    roleRecognitionRateLimitMax: Number(process.env.ROLE_RECOGNITION_RATE_LIMIT_MAX ?? 20),
    // DeepSeek Harness 配置根目录（用于按角色生成会话预设）。默认 ~/.dsh，
    // 测试可通过 DSH_HOME 或 DSG_PRESETS_DIR 隔离到临时目录。
    dshHome: defaultDshHome,
    agentPresetsDir: process.env.DSG_PRESETS_DIR ?? path.join(defaultDshHome, '.agent-presets'),
    // 生成的角色预设里 interchange-tools 行的 workspaceDir：指向本服务运行目录
    // （与 sqlite 同源）。统一转成正斜杠，保证 YAML 无需引号也能正确解析。
    dsgWorkspaceDir: root.replaceAll('\\', '/'),
};
export function requireDeepSeekKey() {
    if (!config.deepseekApiKey) {
        const error = new Error('DEEPSEEK_API_KEY is not configured. Add it to .env before generating AI drafts.');
        Object.assign(error, { status: 503 });
        throw error;
    }
}
