import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from './config.js';
import { repo, toPublicContact, type Contact } from './db.js';
import { buildDeliveryRequest } from './delivery.js';
import { generateDraft, generateRoleSuggestion, recognizeRole } from './ai/modelRouter.js';
import { assertExternalFileModelAllowed, externalModelKindForSource } from './ai/compliance.js';
import { parseUploadedFile } from './parser.js';
import { aiRateLimit, roleRecognitionRateLimit } from './rateLimit.js';
import { findRoleProfileByName, roleProfiles } from './roleProfiles.js';
import { findRoleFocusPresetByName, roleFocusPresets } from './roles.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadLimitMb * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8',
});

const deliveryTypeSchema = z.enum(['generic_webhook', 'dingtalk_robot']);
const contactIdsSchema = z.array(z.number().int().positive()).min(1).max(500).transform((ids) => [...new Set(ids)]);

const contactSchema = z.object({
  name: z.string().min(1),
  roleMode: z.enum(['template', 'custom']).default('template'),
  roleKey: z.string().default(''),
  rolePreferenceId: z.number().int().positive().nullable().optional(),
  customRoleLabel: z.string().default(''),
  customRolePreference: z.string().default(''),
  deliveryType: deliveryTypeSchema.default('generic_webhook'),
  webhookUrl: z.string().default(''),
  dingtalkSecret: z.string().optional(),
  dingtalkKeyword: z.string().default(''),
  clearDingtalkSecret: z.boolean().optional(),
  preference: z.string().default(''),
  active: z.boolean().optional(),
});

const contactUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  roleMode: z.enum(['template', 'custom']).optional(),
  roleKey: z.string().optional(),
  rolePreferenceId: z.number().int().positive().nullable().optional(),
  customRoleLabel: z.string().optional(),
  customRolePreference: z.string().optional(),
  deliveryType: deliveryTypeSchema.optional(),
  webhookUrl: z.string().optional(),
  dingtalkSecret: z.string().optional(),
  dingtalkKeyword: z.string().optional(),
  clearDingtalkSecret: z.boolean().optional(),
  preference: z.string().optional(),
  active: z.boolean().optional(),
});

const roleSchema = z.object({
  label: z.string().trim().min(1),
  defaultPreference: z.string().default(''),
  roleProfileKey: z.string().trim().max(80).default(''),
  roleProfileDescription: z.string().trim().max(400).default(''),
});

const preferenceSetSchema = z.object({
  name: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sortOrder: z.number().int().optional(),
});

const roleSuggestionSchema = z.object({
  roleLabel: z.string().trim().min(1).max(80),
  preferenceSetName: z.string().trim().min(1).max(80).optional(),
  roleProfileKey: z.string().trim().max(80).optional(),
  roleProfileDescription: z.string().trim().max(400).optional(),
});
const roleRecognitionSchema = z.object({
  roleLabel: z.string().trim().min(2).max(80),
});

async function validateContactConfiguration(contact: Pick<Contact, 'roleMode' | 'roleKey' | 'rolePreferenceId' | 'customRoleLabel' | 'customRolePreference'>) {
  const error = await repo.validateContactConfiguration(contact);
  if (error) throw Object.assign(new Error(error), { status: 400 });
}

function validateRoleProfile(input: { roleProfileKey?: string; roleProfileDescription?: string }) {
  const key = input.roleProfileKey?.trim() ?? '';
  const description = input.roleProfileDescription?.trim() ?? '';
  if (!key) return;
  if (key === 'custom' || key === 'deepseek') {
    if (!description) throw Object.assign(new Error('使用自定义角色说明时，请填写说明内容。'), { status: 400 });
    return;
  }
  throw Object.assign(new Error('角色识别方式仅支持自动识别或自定义角色说明。'), { status: 400 });
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    deepseekConfigured: Boolean(config.deepseekApiKey),
    model: config.deepseekModel,
  });
});

router.get('/roles', async (_req, res) => {
  res.json(await repo.roles());
});

router.get('/role-profiles', (_req, res) => {
  res.json(roleProfiles);
});

router.get('/role-focus-presets', (_req, res) => {
  res.json(roleFocusPresets);
});

router.post('/role-profiles/resolve', roleRecognitionRateLimit, async (req, res) => {
  const { roleLabel } = roleRecognitionSchema.parse(req.body);
  const focusPreset = findRoleFocusPresetByName(roleLabel);
  if (focusPreset) {
    return res.json({
      source: 'preset',
      key: focusPreset.key,
      label: focusPreset.label,
      description: focusPreset.defaultPreference,
    });
  }
  const preset = findRoleProfileByName(roleLabel);
  if (preset) {
    return res.json({ source: 'preset', key: preset.key, label: preset.label, description: preset.description });
  }

  const recognized = await recognizeRole({ roleLabel });
  res.json({ source: 'deepseek', key: 'deepseek', ...recognized });
});

router.post('/role-suggestions', aiRateLimit, async (req, res) => {
  const body = roleSuggestionSchema.parse(req.body);
  validateRoleProfile(body);
  if (!body.preferenceSetName) {
    const focusPreset = findRoleFocusPresetByName(body.roleLabel);
    if (focusPreset) return res.json({ content: focusPreset.defaultPreference, source: 'preset' });
  }
  const recognizedInput = !body.preferenceSetName && !body.roleProfileKey
    ? await recognizeRole({ roleLabel: body.roleLabel })
    : null;
  const content = await generateRoleSuggestion(recognizedInput ? {
    ...body,
    roleProfileKey: 'deepseek',
    roleProfileDescription: recognizedInput.description,
  } : body);
  if (!content) {
    throw Object.assign(new Error('模型未返回角色配置建议，请稍后重试。'), { status: 502 });
  }
  res.json({ content, source: 'deepseek' });
});

router.post('/roles', async (req, res) => {
  const body = roleSchema.parse(req.body);
  validateRoleProfile(body);
  res.status(201).json(await repo.createRole(body));
});

router.put('/roles/:key', async (req, res) => {
  const body = z.object({ customPreference: z.string().default('') }).parse(req.body);
  res.json(await repo.updateRole(req.params.key, body));
});

router.patch('/roles/:key', async (req, res) => {
  const body = roleSchema.partial().parse(req.body);
  validateRoleProfile(body);
  res.json(await repo.updateRole(req.params.key, body));
});

router.delete('/roles/:key', async (req, res) => {
  await repo.deleteRole(req.params.key);
  res.status(204).send();
});

router.post('/roles/:key/preference-sets', async (req, res) => {
  const body = preferenceSetSchema.parse(req.body);
  res.status(201).json(await repo.createPreferenceSet(req.params.key, body));
});

router.patch('/preference-sets/:id', async (req, res) => {
  const body = preferenceSetSchema.partial().parse(req.body);
  res.json(await repo.updatePreferenceSet(Number(req.params.id), body));
});

router.delete('/preference-sets/:id', async (req, res) => {
  await repo.deletePreferenceSet(Number(req.params.id));
  res.status(204).send();
});

router.get('/contacts', async (_req, res) => {
  res.json((await repo.contacts()).map(toPublicContact));
});

router.post('/contacts', async (req, res) => {
  const body = contactSchema.parse(req.body);
  await validateContactConfiguration({ ...body, rolePreferenceId: body.rolePreferenceId ?? null });
  const created = await repo.createContact(body as any);
  res.status(201).json(created ? toPublicContact(created) : null);
});

router.put('/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const body = contactUpdateSchema.parse(req.body);
  const existing = await repo.contact(id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  await validateContactConfiguration({ ...existing, ...body });
  const updated = await repo.updateContact(id, body as any);
  if (!updated) return res.status(404).json({ error: 'Contact not found' });
  res.json(toPublicContact(updated));
});

router.patch('/contacts/batch/active', async (req, res) => {
  const body = z.object({ ids: contactIdsSchema, active: z.boolean() }).parse(req.body);
  const contacts = await repo.updateContactsActive(body.ids, body.active);
  res.json({ contacts: contacts.map(toPublicContact) });
});

router.delete('/contacts/batch/inactive', async (req, res) => {
  const body = z.object({ ids: contactIdsSchema }).parse(req.body);
  const deletedIds = await repo.deleteInactiveContacts(body.ids);
  res.json({ deletedIds });
});

router.delete('/contacts/:id', async (req, res) => {
  const deleted = await repo.deleteContact(Number(req.params.id));
  res.status(deleted ? 204 : 404).send();
});

router.post('/inputs/parse', upload.single('file'), async (req, res) => {
  const typedText = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (typedText) {
    const inputRecordId = await repo.createInputRecord('text', '', typedText);
    return res.json({ inputRecordId, sourceType: 'text', filename: '', text: typedText });
  }

  if (!req.file) return res.status(400).json({ error: 'Text or file is required' });

  const parsed = await parseUploadedFile(req.file);
  if (!parsed.text) {
    assertExternalFileModelAllowed(externalModelKindForSource(parsed.sourceType));
    return res.status(422).json({
      error: 'No text could be extracted by local parsing. External model fallback is not implemented in this build.',
    });
  }
  const inputRecordId = await repo.createInputRecord(parsed.sourceType, parsed.filename, parsed.text);
  res.json({ inputRecordId, ...parsed });
});

router.post('/generate', aiRateLimit, async (req, res) => {
  const body = z.object({
    sourceText: z.string().min(1),
    inputRecordId: z.number().nullable().optional(),
    contactIds: z.array(z.number()).min(1),
  }).parse(req.body);

  const drafts = [];

  for (const contactId of body.contactIds) {
    const contact = await repo.contact(contactId);
    if (!contact || !contact.active) continue;
    const role = await repo.resolveRoleForContact(contact);
    if (!role) {
      return res.status(400).json({ error: `联系人“${contact.name}”引用的角色或偏好方案不存在，请重新配置。` });
    }
    const content = await generateDraft({ sourceText: body.sourceText, contact, role });
    const generationRecordId = await repo.createGenerationRecord(
      body.inputRecordId ?? null,
      contact.id,
      role.key,
      content,
    );
    drafts.push({ generationRecordId, contact: toPublicContact(contact), role, content });
  }

  res.json({ drafts });
});

router.post('/send', async (req, res) => {
  const body = z.object({
    messages: z.array(z.object({
      generationRecordId: z.number().nullable().optional(),
      contactId: z.number(),
      content: z.string().min(1),
    })).min(1),
  }).parse(req.body);

  const results = [];
  for (const message of body.messages) {
    const contact = await repo.contact(message.contactId);
    if (!contact) {
      results.push({ contactId: message.contactId, ok: false, error: 'Contact not found' });
      continue;
    }
    if (!contact.webhookUrl) {
      const error = 'Webhook URL is empty';
      const sendRecordId = await repo.createSendRecord({
        generationRecordId: message.generationRecordId ?? null,
        contactId: contact.id,
        deliveryType: contact.deliveryType,
        webhookUrl: '',
        payload: { content: message.content },
        error,
      });
      results.push({ contactId: contact.id, sendRecordId, ok: false, error });
      continue;
    }

    try {
      const delivery = buildDeliveryRequest({ contact, content: message.content });
      const response = await fetch(delivery.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(delivery.payload),
      });
      const responseBody = await response.text();
      const sendRecordId = await repo.createSendRecord({
        generationRecordId: message.generationRecordId ?? null,
        contactId: contact.id,
        deliveryType: delivery.deliveryType,
        webhookUrl: contact.webhookUrl,
        payload: delivery.payload,
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 2000),
        error: response.ok ? '' : `HTTP ${response.status}`,
      });
      results.push({ contactId: contact.id, sendRecordId, ok: response.ok, status: response.status });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const sendRecordId = await repo.createSendRecord({
        generationRecordId: message.generationRecordId ?? null,
        contactId: contact.id,
        deliveryType: contact.deliveryType,
        webhookUrl: contact.webhookUrl,
        payload: { content: message.content },
        error: messageText,
      });
      results.push({ contactId: contact.id, sendRecordId, ok: false, error: messageText });
    }
  }

  res.json({ results });
});

router.get('/records', async (_req, res) => {
  res.json(await repo.records());
});

export { router, upload };
