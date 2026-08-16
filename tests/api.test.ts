import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { createApp } from '../server/index.js';
import { db, migrate, removeLegacyBuiltinRoles, repo } from '../server/db.js';
import { config } from '../server/config.js';
import { resetRateLimitStores } from '../server/rateLimit.js';
import {
  assertExternalFileModelAllowed,
  disabledExternalModelMessages,
  isFileProviderEnabled,
  isVisionProviderEnabled,
} from '../server/ai/compliance.js';
import { buildDingTalkSign } from '../server/delivery.js';
import { buildDraftMessages } from '../server/ai/prompts.js';
import { deepSeekProvider } from '../server/ai/providers/deepseek.js';
import { generateDraft as routeDraft, resolveTextProvider } from '../server/ai/modelRouter.js';
import type { DraftRequest } from '../server/ai/types.js';

const sampleDraftRequest: DraftRequest = {
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

describe('Interchange API', () => {
  let defaultTestRoleKey = '';

  beforeEach(async () => {
    await migrate();
    defaultTestRoleKey = (await repo.createRole({ label: '测试协作角色' })).key;
  });

  afterEach(() => {
    resetRateLimitStores();
    vi.restoreAllMocks();
    vi.doUnmock('../server/ai/modelRouter.js');
    vi.doUnmock('../server/deepseek.js');
  });

  afterAll(() => {
    db.close();
  });

  it('reports health without exposing secrets', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body).not.toHaveProperty('deepseekApiKey');
  });

  it('exposes role profile presets without any model credentials', async () => {
    const response = await request(createApp()).get('/api/role-profiles').expect(200);

    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'general_ai_assistant', label: '通用 AI 助手' }),
      expect.objectContaining({ key: 'ai_coding_assistant', label: 'AI 编程助手' }),
    ]));
  });

  it('uses the local alias table before falling back to DeepSeek role recognition', async () => {
    const recognitionSpy = vi.spyOn(deepSeekProvider, 'recognizeRole');
    const app = createApp();

    const preset = await request(app)
      .post('/api/role-profiles/resolve')
      .send({ roleLabel: 'Codex' })
      .expect(200);

    expect(preset.body).toMatchObject({
      source: 'preset',
      key: 'ai_coding_assistant',
      label: 'AI 编程助手',
    });
    expect(recognitionSpy).not.toHaveBeenCalled();

    recognitionSpy.mockResolvedValueOnce({
      label: 'SMT 工艺工程师',
      description: '关注贴片工艺参数、良率、缺陷闭环、产线变更与验证。',
    });
    const fallback = await request(app)
      .post('/api/role-profiles/resolve')
      .send({ roleLabel: 'SMT 工艺工程师' })
      .expect(200);

    expect(recognitionSpy).toHaveBeenCalledWith({ roleLabel: 'SMT 工艺工程师' });
    expect(fallback.body).toEqual({
      source: 'deepseek',
      key: 'deepseek',
      label: 'SMT 工艺工程师',
      description: '关注贴片工艺参数、良率、缺陷闭环、产线变更与验证。',
    });
  });

  it('returns local focus presets without calling DeepSeek and falls back to recognition for unknown roles', async () => {
    const recognitionSpy = vi.spyOn(deepSeekProvider, 'recognizeRole');
    const suggestionSpy = vi.spyOn(deepSeekProvider, 'generateRoleSuggestion');
    const app = createApp();

    const preset = await request(app)
      .post('/api/role-suggestions')
      .send({ roleLabel: '产品经理' })
      .expect(200);

    expect(preset.body).toEqual({
      content: '关注用户价值、范围变化、交互影响、验收口径和是否需要调整需求文档。',
      source: 'preset',
    });
    expect(recognitionSpy).not.toHaveBeenCalled();
    expect(suggestionSpy).not.toHaveBeenCalled();

    recognitionSpy.mockResolvedValueOnce({
      label: 'SMT 工艺工程师',
      description: '关注贴片工艺参数、良率、缺陷闭环、产线变更与验证。',
    });
    suggestionSpy.mockResolvedValueOnce({ content: '关注工艺参数、良率、缺陷闭环、产线变更与验证。' });
    const fallback = await request(app)
      .post('/api/role-suggestions')
      .send({ roleLabel: 'SMT 工艺工程师' })
      .expect(200);

    expect(fallback.body).toEqual({ content: '关注工艺参数、良率、缺陷闭环、产线变更与验证。', source: 'deepseek' });
    expect(recognitionSpy).toHaveBeenCalledWith({ roleLabel: 'SMT 工艺工程师' });
    expect(suggestionSpy).toHaveBeenCalledWith(expect.objectContaining({
      roleLabel: 'SMT 工艺工程师',
      roleProfileKey: 'deepseek',
    }));
  });

  it('removes legacy built-in roles and their contacts while preserving generation history', async () => {
    const timestamp = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO roles (key, label, default_preference, custom_preference, role_profile_key, role_profile_description, updated_at)
            VALUES (?, ?, ?, '', '', '', ?)`,
      args: ['product', '产品', '旧关注点', timestamp],
    });
    const contact = await repo.createContact({ name: '旧产品联系人', roleKey: 'product', webhookUrl: '' });
    const preferenceSet = await repo.createPreferenceSet('product', { name: '旧偏好', content: '旧内容' });
    const generationId = await repo.createGenerationRecord(null, contact!.id, 'product', '历史草稿');

    await db.execute({ sql: 'DELETE FROM app_migrations WHERE key = ?', args: ['remove_legacy_builtin_roles_v1'] });
    await removeLegacyBuiltinRoles();

    expect(await repo.role('product')).toBeNull();
    expect(await repo.contact(contact!.id)).toBeNull();
    expect(await repo.preferenceSet(preferenceSet!.id)).toBeNull();
    const history = await db.execute({ sql: 'SELECT id FROM generation_records WHERE id = ?', args: [generationId] });
    expect(history.rows).toHaveLength(1);
  });

  it('serves JSON health responses from the Vercel API function entrypoint', async () => {
    const { default: vercelApiApp } = await import('../api/[...path].js');

    const apiPathResponse = await request(vercelApiApp).get('/api/health').expect(200);
    const strippedPathResponse = await request(vercelApiApp).get('/health').expect(200);

    expect(apiPathResponse.type).toContain('json');
    expect(strippedPathResponse.type).toContain('json');
    expect(apiPathResponse.body.ok).toBe(true);
    expect(strippedPathResponse.body.ok).toBe(true);
  });

  it('creates and updates contacts', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/contacts')
      .send({ name: 'Webhook 测试', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
      .expect(201);

    expect(created.body.id).toBeTypeOf('number');
    const updated = await request(app)
      .put(`/api/contacts/${created.body.id}`)
      .send({ preference: '先列风险，再列用例。' })
      .expect(200);

    expect(updated.body.preference).toContain('风险');
  });

  it('does not expose DingTalk robot secrets through contact APIs', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/contacts')
      .send({
        name: 'DingTalk',
        roleKey: defaultTestRoleKey,
        deliveryType: 'dingtalk_robot',
        webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=test',
        dingtalkSecret: 'ding-secret',
        dingtalkKeyword: 'Interchange',
        preference: '',
        active: true,
      })
      .expect(201);

    expect(created.body.dingtalkSecretConfigured).toBe(true);
    expect(created.body).not.toHaveProperty('dingtalkSecret');

    const contacts = await request(app).get('/api/contacts').expect(200);
    const matched = contacts.body.find((contact: any) => contact.id === created.body.id);
    expect(matched.dingtalkSecretConfigured).toBe(true);
    expect(matched).not.toHaveProperty('dingtalkSecret');

    const cleared = await request(app)
      .put(`/api/contacts/${created.body.id}`)
      .send({ clearDingtalkSecret: true })
      .expect(200);
    expect(cleared.body.dingtalkSecretConfigured).toBe(false);
  });

  it('toggles contact active state through the existing update endpoint', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/contacts')
      .send({ name: '状态切换', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
      .expect(201);

    const disabled = await request(app)
      .put(`/api/contacts/${created.body.id}`)
      .send({ active: false })
      .expect(200);

    expect(disabled.body.active).toBe(false);

    const enabled = await request(app)
      .put(`/api/contacts/${created.body.id}`)
      .send({ active: true })
      .expect(200);

    expect(enabled.body.active).toBe(true);
  });

  it('updates and deletes contacts in batches through one API request per operation', async () => {
    const app = createApp();
    const first = await request(app)
      .post('/api/contacts')
      .send({ name: '批量联系人一', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
      .expect(201);
    const second = await request(app)
      .post('/api/contacts')
      .send({ name: '批量联系人二', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
      .expect(201);
    const ids = [first.body.id, second.body.id];

    const disabled = await request(app)
      .patch('/api/contacts/batch/active')
      .send({ ids, active: false })
      .expect(200);
    expect(disabled.body.contacts.map((contact: any) => contact.id)).toEqual(ids);
    expect(disabled.body.contacts.every((contact: any) => contact.active === false)).toBe(true);

    const deleted = await request(app)
      .delete('/api/contacts/batch/inactive')
      .send({ ids })
      .expect(200);
    expect(deleted.body.deletedIds).toEqual(ids);

    const contacts = await request(app).get('/api/contacts').expect(200);
    expect(contacts.body.some((contact: any) => ids.includes(contact.id))).toBe(false);
  });

  it('skips inactive contacts during generation', async () => {
    const app = createApp();
    const contact = await request(app)
      .post('/api/contacts')
      .send({ name: '停用联系人', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: false })
      .expect(201);

    const response = await request(app)
      .post('/api/generate')
      .send({ sourceText: '变更：只验证停用联系人会被跳过。', inputRecordId: null, contactIds: [contact.body.id] })
      .expect(200);

    expect(response.body.drafts).toEqual([]);
  });

  it('keeps the existing permanent delete contact endpoint behavior', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/contacts')
      .send({ name: '待删除联系人', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: false })
      .expect(201);

    await request(app).delete(`/api/contacts/${created.body.id}`).expect(204);

    const contacts = await request(app).get('/api/contacts').expect(200);
    expect(contacts.body.some((contact: any) => contact.id === created.body.id)).toBe(false);
  });

  it('parses typed text into an input record', async () => {
    const response = await request(createApp())
      .post('/api/inputs/parse')
      .field('text', '修复登录页空状态，并补充测试。')
      .expect(200);

    expect(response.body.inputRecordId).toBeTypeOf('number');
    expect(response.body.text).toContain('登录页');
  });

  it('returns a clear error when DeepSeek key is missing', async () => {
    const originalApiKey = config.deepseekApiKey;
    try {
      config.deepseekApiKey = '';
      const app = createApp();
      const contact = await request(app)
        .post('/api/contacts')
        .send({ name: 'AI', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
        .expect(201);

      const response = await request(app)
        .post('/api/generate')
        .send({ sourceText: '变更：新增联系人管理。', inputRecordId: null, contactIds: [contact.body.id] })
        .expect(503);

      expect(response.body.error).toContain('DEEPSEEK_API_KEY');
    } finally {
      config.deepseekApiKey = originalApiKey;
    }
  });

  it('uses DeepSeek as the default text model provider', () => {
    const originalProvider = config.textModelProvider;
    try {
      config.textModelProvider = 'deepseek';
      expect(resolveTextProvider()).toBe(deepSeekProvider);
    } finally {
      config.textModelProvider = originalProvider;
    }
  });

  it('exposes AI coding workflow templates through local focus presets', async () => {
    const response = await request(createApp()).get('/api/role-focus-presets').expect(200);
    const primaryAiPreset = response.body.find((preset: any) => preset.key === 'my_ai_coding_tool');
    const teammateAiPreset = response.body.find((preset: any) => preset.key === 'teammate_ai_coding_tool');

    expect(primaryAiPreset.preferenceTemplates[0].content).toContain('主执行 AI');
    expect(primaryAiPreset.preferenceTemplates[0].content).toContain('Agent Skills');
    expect(teammateAiPreset.preferenceTemplates[0].content).toContain('同项目协作 AI');
    expect(teammateAiPreset.preferenceTemplates[0].content).toContain('协作边界');
  });

  it('manages custom roles and preference sets while protecting active associations', async () => {
    const app = createApp();
    const role = await request(app)
      .post('/api/roles')
      .send({ label: '售前顾问', defaultPreference: '关注客户顾虑与下一步。' })
      .expect(201);

    expect(role.body).not.toHaveProperty('isBuiltin');
    expect(role.body.roleProfileKey).toBe('');
    const preferenceSet = await request(app)
      .post(`/api/roles/${role.body.key}/preference-sets`)
      .send({ name: '简洁版', content: '先给结论，再给两项行动。', sortOrder: 0 })
      .expect(201);

    const contact = await request(app)
      .post('/api/contacts')
      .send({ name: '售前同学', roleKey: role.body.key, rolePreferenceId: preferenceSet.body.id, webhookUrl: '' })
      .expect(201);

    expect(contact.body.rolePreferenceId).toBe(preferenceSet.body.id);
    await request(app).delete(`/api/preference-sets/${preferenceSet.body.id}`).expect(409);
    await request(app).delete(`/api/roles/${role.body.key}`).expect(409);

    const custom = await request(app)
      .put(`/api/contacts/${contact.body.id}`)
      .send({
        roleMode: 'custom',
        roleKey: '',
        rolePreferenceId: null,
        customRoleLabel: '项目赞助人',
        customRolePreference: '只要业务结论、风险和待决事项。',
      })
      .expect(200);

    expect(custom.body.roleMode).toBe('custom');
    await request(app).delete(`/api/preference-sets/${preferenceSet.body.id}`).expect(204);
    await request(app).delete(`/api/roles/${role.body.key}`).expect(204);
  });

  it('rejects incomplete contact-only role settings', async () => {
    await request(createApp())
      .post('/api/contacts')
      .send({ name: '缺少偏好的专属角色', roleMode: 'custom', customRoleLabel: '临时角色' })
      .expect(400);
  });

  it('disables external vision and file model providers by default', () => {
    expect(config.visionModelProvider).toBe('none');
    expect(config.fileModelProvider).toBe('none');
    expect(isVisionProviderEnabled()).toBe(false);
    expect(isFileProviderEnabled()).toBe(false);
  });

  it('returns readable errors when external vision or file providers are disabled', () => {
    const originalVisionProvider = config.visionModelProvider;
    const originalFileProvider = config.fileModelProvider;
    try {
      config.visionModelProvider = 'none';
      config.fileModelProvider = 'none';

      expect(() => assertExternalFileModelAllowed('vision')).toThrow(disabledExternalModelMessages.vision);
      expect(() => assertExternalFileModelAllowed('file')).toThrow(disabledExternalModelMessages.file);
    } finally {
      config.visionModelProvider = originalVisionProvider;
      config.fileModelProvider = originalFileProvider;
    }
  });

  it('does not call an external model path when local file parsing returns no text', async () => {
    const originalFileProvider = config.fileModelProvider;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      config.fileModelProvider = 'none';
      const response = await request(createApp())
        .post('/api/inputs/parse')
        .attach('file', Buffer.alloc(0), { filename: 'empty.txt', contentType: 'text/plain' })
        .expect(422);

      expect(response.body.error).toBe(disabledExternalModelMessages.file);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      config.fileModelProvider = originalFileProvider;
    }
  });

  it('preserves UTF-8 filenames uploaded through multipart form data', async () => {
    const filename = '菜单功能迁移清单.md';
    const response = await request(createApp())
      .post('/api/inputs/parse')
      .attach('file', Buffer.from('# 测试内容', 'utf8'), { filename, contentType: 'text/markdown' })
      .expect(200);

    expect(response.body.filename).toBe(filename);
  });

  it('keeps the existing prompt preference order', () => {
    const messages = buildDraftMessages({
      ...sampleDraftRequest,
      contact: { ...sampleDraftRequest.contact, preference: '联系人偏好' },
      role: {
        ...sampleDraftRequest.role,
        defaultPreference: '默认偏好',
        customPreference: '自定义偏好',
      },
    });

    expect(messages[0].content).toContain('保留事实');
    expect(messages[0].content).toContain('用户自定义补充视为高优先级提示词');
    expect(messages[1].content).toContain('收件人：AI');
    expect(messages[1].content).toContain('角色：我的 AI 编程工具');
    expect(messages[1].content).toContain('角色默认关注点：默认偏好');
    expect(messages[1].content).toContain('用户自定义补充：自定义偏好');
    expect(messages[1].content).toContain('收件人补充偏好：联系人偏好');
    expect(messages[1].content).toContain('变更：新增联系人管理。');
  });

  it('returns a readable error for missing or unsupported text model providers', async () => {
    const originalProvider = config.textModelProvider;
    try {
      config.textModelProvider = '';
      await expect(routeDraft(sampleDraftRequest)).rejects.toThrow('Unsupported TEXT_MODEL_PROVIDER');

      config.textModelProvider = 'unknown-provider';
      await expect(routeDraft(sampleDraftRequest)).rejects.toThrow('Unsupported TEXT_MODEL_PROVIDER');
    } finally {
      config.textModelProvider = originalProvider;
    }
  });

  it('calls /generate through the model router instead of the legacy DeepSeek module', async () => {
    const generateDraft = vi.fn(async () => 'router generated draft');
    vi.resetModules();
    vi.doMock('../server/ai/modelRouter.js', () => ({ generateDraft }));
    vi.doMock('../server/deepseek.js', () => ({
      generateDraft: vi.fn(async () => {
        throw new Error('legacy DeepSeek module should not be called');
      }),
    }));

    const { createApp: createMockedApp } = await import('../server/index.js');
    const { db: mockedDb } = await import('../server/db.js');
    const app = createMockedApp();

    try {
      const role = await request(app)
        .post('/api/roles')
        .send({ label: '路由测试角色' })
        .expect(201);
      const contact = await request(app)
        .post('/api/contacts')
        .send({ name: 'Router Contact', roleKey: role.body.key, webhookUrl: '', preference: '', active: true })
        .expect(201);

      const response = await request(app)
        .post('/api/generate')
        .send({ sourceText: '变更：新增联系人管理。', inputRecordId: null, contactIds: [contact.body.id] })
        .expect(200);

      expect(generateDraft).toHaveBeenCalledTimes(1);
      expect(response.body.drafts[0].content).toBe('router generated draft');
    } finally {
      mockedDb.close();
      vi.resetModules();
    }
  });

  it('sends confirmed messages to a generic webhook', async () => {
    let received: any = null;
    const receiver = express();
    receiver.use(express.json());
    receiver.post('/hook', (req, res) => {
      received = req.body;
      res.status(202).json({ ok: true });
    });

    const server = await new Promise<Server>((resolve) => {
      const instance = createServer(receiver);
      instance.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test server address');
      const webhookUrl = `http://127.0.0.1:${address.port}/hook`;
      const app = createApp();
      const contact = await request(app)
        .post('/api/contacts')
        .send({ name: 'Hook', roleKey: defaultTestRoleKey, webhookUrl, preference: '', active: true })
        .expect(201);

      const response = await request(app)
        .post('/api/send')
        .send({ messages: [{ generationRecordId: null, contactId: contact.body.id, content: '确认发送内容' }] })
        .expect(200);

      expect(response.body.results[0].ok).toBe(true);
      expect(received.content).toBe('确认发送内容');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('generates a role configuration suggestion without saving it', async () => {
    const suggestionSpy = vi.spyOn(deepSeekProvider, 'generateRoleSuggestion').mockResolvedValueOnce({
      content: '关注任务目标、约束条件、风险和验收标准。',
    });

    const response = await request(createApp())
      .post('/api/role-suggestions')
      .send({ roleLabel: '豆包', preferenceSetName: '严肃点' })
      .expect(200);

    expect(response.body).toEqual({ content: '关注任务目标、约束条件、风险和验收标准。', source: 'deepseek' });
    expect(suggestionSpy).toHaveBeenCalledWith({ roleLabel: '豆包', preferenceSetName: '严肃点' });
  });

  it('rate limits generation requests before calling the model provider', async () => {
    const originalApiKey = config.deepseekApiKey;
    const originalAiLimit = config.aiRateLimitMax;
    const originalWindowMs = config.rateLimitWindowMs;
    try {
      config.deepseekApiKey = 'test-key';
      config.aiRateLimitMax = 1;
      config.rateLimitWindowMs = 60000;
      const app = createApp();
      const contact = await request(app)
        .post('/api/contacts')
        .send({ name: 'Limited AI', roleKey: defaultTestRoleKey, webhookUrl: '', preference: '', active: true })
        .expect(201);

      vi.spyOn(deepSeekProvider, 'generateDraft').mockResolvedValue({ content: 'first draft' });

      await request(app)
        .post('/api/generate')
        .send({ sourceText: 'first', inputRecordId: null, contactIds: [contact.body.id] })
        .expect(200);

      const limited = await request(app)
        .post('/api/generate')
        .send({ sourceText: 'second', inputRecordId: null, contactIds: [contact.body.id] })
        .expect(429);

      expect(limited.body.error).toContain('Too many generation requests');
      expect(limited.headers['retry-after']).toBeDefined();
      expect(deepSeekProvider.generateDraft).toHaveBeenCalledTimes(1);
    } finally {
      config.deepseekApiKey = originalApiKey;
      config.aiRateLimitMax = originalAiLimit;
      config.rateLimitWindowMs = originalWindowMs;
    }
  });

  it('sends confirmed messages to a DingTalk robot as signed markdown', async () => {
    let received: any = null;
    let receivedUrl = '';
    const receiver = express();
    receiver.use(express.json());
    receiver.post('/hook', (req, res) => {
      received = req.body;
      receivedUrl = req.url;
      res.status(200).json({ errcode: 0, errmsg: 'ok' });
    });

    const server = await new Promise<Server>((resolve) => {
      const instance = createServer(receiver);
      instance.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test server address');
      const webhookUrl = `http://127.0.0.1:${address.port}/hook?access_token=test-token`;
      const secret = 'this is a secret';
      const app = createApp();
      const contact = await request(app)
        .post('/api/contacts')
        .send({
          name: 'Ding',
          roleKey: defaultTestRoleKey,
          deliveryType: 'dingtalk_robot',
          webhookUrl,
          dingtalkSecret: secret,
          dingtalkKeyword: 'Interchange',
          preference: '',
          active: true,
        })
        .expect(201);

      const response = await request(app)
        .post('/api/send')
        .send({ messages: [{ generationRecordId: null, contactId: contact.body.id, content: '确认发送内容' }] })
        .expect(200);

      expect(response.body.results[0].ok).toBe(true);
      expect(received.msgtype).toBe('markdown');
      expect(received.markdown.title).toBe('Interchange - Ding');
      expect(received.markdown.text).toContain('Interchange');
      expect(received.markdown.text).toContain('确认发送内容');

      const url = new URL(`http://127.0.0.1${receivedUrl}`);
      const timestamp = Number(url.searchParams.get('timestamp'));
      expect(timestamp).toBeGreaterThan(0);
      expect(url.searchParams.get('sign')).toBe(buildDingTalkSign(secret, timestamp));

      const records = await request(app).get('/api/records').expect(200);
      expect(records.body.sends[0].delivery_type).toBe('dingtalk_robot');
      expect(records.body.sends[0].payload).not.toContain(secret);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
