import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { legacyBuiltinRoleKeys } from './roles.js';
const useTurso = process.env.NODE_ENV !== 'test' && Boolean(config.tursoDatabaseUrl && config.tursoAuthToken);
const databaseUrl = useTurso ? config.tursoDatabaseUrl : process.env.NODE_ENV === 'test'
    ? 'file::memory:'
    : pathToFileURL(config.sqlitePath).href;
// 全新克隆时 data/ 目录尚不存在，先创建父目录，避免 SQLITE_CANTOPEN。
if (!useTurso && process.env.NODE_ENV !== 'test') {
    try {
        mkdirSync(dirname(config.sqlitePath), { recursive: true });
    }
    catch { }
}
export const db = createClient({
    url: databaseUrl,
    ...(useTurso ? { authToken: config.tursoAuthToken } : {}),
});
function now() {
    return new Date().toISOString();
}
function value(row, key) {
    return row[key];
}
function rowObject(row, columns) {
    return Object.fromEntries(columns.map((column) => [column, row[column]]));
}
function numericValue(value) {
    return Number(value ?? 0);
}
function stringArrayValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item));
    }
    if (typeof value === 'string' && value.trim() !== '') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed))
                return parsed.map((item) => String(item));
        }
        catch { }
    }
    return [];
}
async function ensureColumn(tableName, columnName, definition) {
    const columns = await db.execute(`PRAGMA table_info(${tableName})`);
    if (!columns.rows.some((column) => value(column, 'name') === columnName)) {
        await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}
async function dropColumnIfExists(tableName, columnName) {
    const columns = await db.execute(`PRAGMA table_info(${tableName})`);
    if (columns.rows.some((column) => value(column, 'name') === columnName)) {
        await db.execute(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
    }
}
let migrationPromise;
export async function removeLegacyBuiltinRoles() {
    const legacyMigrationKey = 'remove_legacy_builtin_roles_v1';
    const migrationResult = await db.execute({ sql: 'SELECT key FROM app_migrations WHERE key = ?', args: [legacyMigrationKey] });
    if (migrationResult.rows.length)
        return;
    const placeholders = legacyBuiltinRoleKeys.map(() => '?').join(', ');
    await db.execute({
        sql: `DELETE FROM contacts WHERE role_mode = 'template' AND role_key IN (${placeholders})`,
        args: [...legacyBuiltinRoleKeys],
    });
    await db.execute({
        sql: `DELETE FROM role_preference_sets WHERE role_key IN (${placeholders})`,
        args: [...legacyBuiltinRoleKeys],
    });
    await db.execute({ sql: `DELETE FROM roles WHERE key IN (${placeholders})`, args: [...legacyBuiltinRoleKeys] });
    await db.execute({ sql: 'INSERT INTO app_migrations (key, applied_at) VALUES (?, ?)', args: [legacyMigrationKey, now()] });
}
async function runMigrations() {
    await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS roles (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      default_preference TEXT NOT NULL,
      custom_preference TEXT NOT NULL DEFAULT '',
      role_profile_key TEXT NOT NULL DEFAULT '',
      role_profile_description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_preference_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_key TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role_key TEXT NOT NULL DEFAULT '',
      role_mode TEXT NOT NULL DEFAULT 'template',
      role_preference_id INTEGER,
      custom_role_label TEXT NOT NULL DEFAULT '',
      custom_role_preference TEXT NOT NULL DEFAULT '',
      delivery_type TEXT NOT NULL DEFAULT 'generic_webhook',
      webhook_url TEXT NOT NULL DEFAULT '',
      dingtalk_secret TEXT NOT NULL DEFAULT '',
      dingtalk_keyword TEXT NOT NULL DEFAULT '',
      preference TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS input_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      filename TEXT NOT NULL DEFAULT '',
      normalized_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_record_id INTEGER,
      contact_id INTEGER NOT NULL,
      role_key TEXT NOT NULL,
      draft_content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS send_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_record_id INTEGER,
      contact_id INTEGER NOT NULL,
      delivery_type TEXT NOT NULL DEFAULT 'generic_webhook',
      webhook_url TEXT NOT NULL,
      payload TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
    await ensureColumn('roles', 'role_profile_key', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('roles', 'role_profile_description', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('contacts', 'role_mode', "TEXT NOT NULL DEFAULT 'template'");
    await ensureColumn('contacts', 'role_preference_id', 'INTEGER');
    await ensureColumn('contacts', 'custom_role_label', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('contacts', 'custom_role_preference', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('contacts', 'delivery_type', "TEXT NOT NULL DEFAULT 'generic_webhook'");
    await ensureColumn('contacts', 'dingtalk_secret', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('contacts', 'dingtalk_keyword', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('send_records', 'delivery_type', "TEXT NOT NULL DEFAULT 'generic_webhook'");
    await ensureColumn('roles', 'dsg_enabled', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('roles', 'dsg_skills', "TEXT NOT NULL DEFAULT '[]'");
    // 工具勾选已移除：删除旧库遗留的 dsg_tools 列（幂等，仅存在时删除）。
    await dropColumnIfExists('roles', 'dsg_tools');
    await removeLegacyBuiltinRoles();
    await db.execute(`
    INSERT INTO role_preference_sets (role_key, name, content, sort_order, created_at, updated_at)
    SELECT r.key, '原有自定义偏好', r.custom_preference, 0, r.updated_at, r.updated_at
    FROM roles r
    WHERE TRIM(r.custom_preference) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM role_preference_sets p
        WHERE p.role_key = r.key AND p.name = '原有自定义偏好'
      )
  `);
}
export function migrate() {
    migrationPromise ??= runMigrations();
    return migrationPromise;
}
function mapContact(row) {
    return {
        id: numericValue(row.id),
        name: String(row.name ?? ''),
        roleMode: row.role_mode === 'custom' ? 'custom' : 'template',
        roleKey: String(row.role_key ?? ''),
        rolePreferenceId: row.role_preference_id == null ? null : numericValue(row.role_preference_id),
        customRoleLabel: String(row.custom_role_label ?? ''),
        customRolePreference: String(row.custom_role_preference ?? ''),
        deliveryType: row.delivery_type ?? 'generic_webhook',
        webhookUrl: row.webhook_url ?? '',
        dingtalkSecret: row.dingtalk_secret ?? '',
        dingtalkKeyword: row.dingtalk_keyword ?? '',
        preference: row.preference ?? '',
        active: Boolean(row.active),
        createdAt: row.created_at ?? '',
        updatedAt: row.updated_at ?? '',
    };
}
export function toPublicContact(contact) {
    const { dingtalkSecret, ...publicContact } = contact;
    return { ...publicContact, dingtalkSecretConfigured: Boolean(dingtalkSecret) };
}
function mapPreferenceSet(row) {
    return {
        id: numericValue(row.id),
        roleKey: String(row.role_key),
        name: String(row.name),
        content: String(row.content),
        sortOrder: numericValue(row.sort_order),
        usageCount: numericValue(row.usage_count),
    };
}
function mapRole(row, preferenceSets = []) {
    return {
        key: String(row.key),
        label: String(row.label),
        defaultPreference: String(row.default_preference ?? ''),
        customPreference: String(row.custom_preference ?? ''),
        roleProfileKey: String(row.role_profile_key ?? ''),
        roleProfileDescription: String(row.role_profile_description ?? ''),
        dsgEnabled: Boolean(row.dsg_enabled),
        dsgSkills: stringArrayValue(row.dsg_skills),
        usageCount: numericValue(row.usage_count),
        preferenceSets,
        updatedAt: String(row.updated_at ?? ''),
    };
}
async function roleRows() {
    const [rolesResult, preferenceResult] = await Promise.all([
        db.execute(`
      SELECT r.*, (
        SELECT COUNT(*) FROM contacts c
        WHERE c.role_mode = 'template' AND c.role_key = r.key
      ) AS usage_count
      FROM roles r
      ORDER BY r.rowid ASC
    `),
        db.execute(`
      SELECT p.*, (
        SELECT COUNT(*) FROM contacts c WHERE c.role_preference_id = p.id
      ) AS usage_count
      FROM role_preference_sets p
      ORDER BY p.role_key, p.sort_order ASC, p.id ASC
    `),
    ]);
    const byRole = new Map();
    for (const row of preferenceResult.rows) {
        const preferenceSet = mapPreferenceSet(rowObject(row, preferenceResult.columns));
        const current = byRole.get(preferenceSet.roleKey) ?? [];
        current.push(preferenceSet);
        byRole.set(preferenceSet.roleKey, current);
    }
    return rolesResult.rows.map((row) => {
        const data = rowObject(row, rolesResult.columns);
        return mapRole(data, byRole.get(String(data.key)) ?? []);
    });
}
function notFound(message) {
    return Object.assign(new Error(message), { status: 404 });
}
function conflict(message) {
    return Object.assign(new Error(message), { status: 409 });
}
export const repo = {
    async roles() {
        return roleRows();
    },
    async role(key) {
        return (await roleRows()).find((role) => role.key === key) ?? null;
    },
    async createRole(input) {
        const key = `custom_${randomUUID()}`;
        const timestamp = now();
        await db.execute({
            sql: `INSERT INTO roles (key, label, default_preference, custom_preference, role_profile_key, role_profile_description, dsg_enabled, dsg_skills, updated_at)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`,
            args: [
                key,
                input.label.trim(),
                input.defaultPreference?.trim() ?? '',
                input.roleProfileKey?.trim() ?? '',
                input.roleProfileDescription?.trim() ?? '',
                input.dsgEnabled ? 1 : 0,
                JSON.stringify(input.dsgSkills ?? []),
                timestamp,
            ],
        });
        return (await repo.role(key));
    },
    async updateRole(key, input) {
        const existing = await repo.role(key);
        if (!existing)
            throw notFound('角色不存在');
        const label = input.label?.trim() ?? existing.label;
        const defaultPreference = input.defaultPreference?.trim() ?? existing.defaultPreference;
        const customPreference = input.customPreference ?? existing.customPreference;
        const roleProfileKey = input.roleProfileKey?.trim() ?? existing.roleProfileKey;
        const roleProfileDescription = input.roleProfileDescription?.trim() ?? existing.roleProfileDescription;
        const dsgEnabled = input.dsgEnabled ?? existing.dsgEnabled;
        const dsgSkills = input.dsgSkills ?? existing.dsgSkills;
        await db.execute({
            sql: `UPDATE roles SET label = ?, default_preference = ?, custom_preference = ?, role_profile_key = ?, role_profile_description = ?, dsg_enabled = ?, dsg_skills = ?, updated_at = ? WHERE key = ?`,
            args: [label, defaultPreference, customPreference, roleProfileKey, roleProfileDescription, dsgEnabled ? 1 : 0, JSON.stringify(dsgSkills), now(), key],
        });
        return (await repo.role(key));
    },
    async deleteRole(key) {
        const role = await repo.role(key);
        if (!role)
            throw notFound('角色不存在');
        if (role.usageCount > 0)
            throw conflict(`该角色仍被 ${role.usageCount} 位联系人使用，请先更换联系人角色`);
        await db.execute({ sql: 'DELETE FROM role_preference_sets WHERE role_key = ?', args: [key] });
        await db.execute({ sql: 'DELETE FROM roles WHERE key = ?', args: [key] });
    },
    async createPreferenceSet(roleKey, input) {
        const role = await repo.role(roleKey);
        if (!role)
            throw notFound('角色不存在');
        const timestamp = now();
        const sortOrder = input.sortOrder ?? (role.preferenceSets.at(-1)?.sortOrder ?? -1) + 1;
        const result = await db.execute({
            sql: `INSERT INTO role_preference_sets (role_key, name, content, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
            args: [roleKey, input.name.trim(), input.content.trim(), sortOrder, timestamp, timestamp],
        });
        return repo.preferenceSet(numericValue(result.lastInsertRowid));
    },
    async preferenceSet(id) {
        const result = await db.execute({
            sql: `SELECT p.*, (SELECT COUNT(*) FROM contacts c WHERE c.role_preference_id = p.id) AS usage_count
            FROM role_preference_sets p WHERE p.id = ?`,
            args: [id],
        });
        return result.rows[0] ? mapPreferenceSet(rowObject(result.rows[0], result.columns)) : null;
    },
    async updatePreferenceSet(id, input) {
        const existing = await repo.preferenceSet(id);
        if (!existing)
            throw notFound('偏好方案不存在');
        await db.execute({
            sql: `UPDATE role_preference_sets SET name = ?, content = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
            args: [input.name?.trim() ?? existing.name, input.content?.trim() ?? existing.content, input.sortOrder ?? existing.sortOrder, now(), id],
        });
        return (await repo.preferenceSet(id));
    },
    async deletePreferenceSet(id) {
        const preferenceSet = await repo.preferenceSet(id);
        if (!preferenceSet)
            throw notFound('偏好方案不存在');
        if (preferenceSet.usageCount > 0)
            throw conflict(`该偏好方案仍被 ${preferenceSet.usageCount} 位联系人使用，请先更换联系人偏好`);
        await db.execute({ sql: 'DELETE FROM role_preference_sets WHERE id = ?', args: [id] });
    },
    async contacts() {
        const result = await db.execute('SELECT * FROM contacts ORDER BY active DESC, id ASC');
        return result.rows.map((row) => mapContact(rowObject(row, result.columns)));
    },
    async contact(id) {
        const result = await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ?', args: [id] });
        return result.rows[0] ? mapContact(rowObject(result.rows[0], result.columns)) : null;
    },
    async createContact(input) {
        const createdAt = now();
        const roleMode = input.roleMode ?? 'template';
        const result = await db.execute({ sql: `
      INSERT INTO contacts (
        name, role_key, role_mode, role_preference_id, custom_role_label, custom_role_preference,
        delivery_type, webhook_url, dingtalk_secret, dingtalk_keyword, preference, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, args: [
                input.name.trim(), input.roleKey ?? '', roleMode, input.rolePreferenceId ?? null,
                input.customRoleLabel?.trim() ?? '', input.customRolePreference?.trim() ?? '',
                input.deliveryType ?? 'generic_webhook', input.webhookUrl ?? '', input.dingtalkSecret ?? '',
                input.dingtalkKeyword ?? '', input.preference ?? '', input.active === false ? 0 : 1, createdAt, createdAt,
            ] });
        return repo.contact(numericValue(result.lastInsertRowid));
    },
    async updateContact(id, input) {
        const existing = await repo.contact(id);
        if (!existing)
            return null;
        const next = {
            name: input.name?.trim() ?? existing.name,
            roleMode: input.roleMode ?? existing.roleMode,
            roleKey: input.roleKey ?? existing.roleKey,
            rolePreferenceId: input.rolePreferenceId === undefined ? existing.rolePreferenceId : input.rolePreferenceId,
            customRoleLabel: input.customRoleLabel?.trim() ?? existing.customRoleLabel,
            customRolePreference: input.customRolePreference?.trim() ?? existing.customRolePreference,
            deliveryType: input.deliveryType ?? existing.deliveryType,
            webhookUrl: input.webhookUrl ?? existing.webhookUrl,
            dingtalkSecret: input.clearDingtalkSecret ? '' : input.dingtalkSecret ?? existing.dingtalkSecret,
            dingtalkKeyword: input.dingtalkKeyword ?? existing.dingtalkKeyword,
            preference: input.preference ?? existing.preference,
            active: input.active ?? existing.active,
        };
        await db.execute({ sql: `
      UPDATE contacts SET name = ?, role_key = ?, role_mode = ?, role_preference_id = ?,
        custom_role_label = ?, custom_role_preference = ?, delivery_type = ?, webhook_url = ?,
        dingtalk_secret = ?, dingtalk_keyword = ?, preference = ?, active = ?, updated_at = ? WHERE id = ?
    `, args: [
                next.name, next.roleKey, next.roleMode, next.rolePreferenceId, next.customRoleLabel, next.customRolePreference,
                next.deliveryType, next.webhookUrl, next.dingtalkSecret, next.dingtalkKeyword, next.preference,
                next.active ? 1 : 0, now(), id,
            ] });
        return repo.contact(id);
    },
    async validateContactConfiguration(contact) {
        if (contact.roleMode === 'custom') {
            if (!contact.customRoleLabel.trim())
                return '联系人专属角色名称不能为空';
            if (!contact.customRolePreference.trim())
                return '联系人专属角色偏好不能为空';
            return null;
        }
        const role = await repo.role(contact.roleKey);
        if (!role)
            return '所选角色不存在';
        if (contact.rolePreferenceId != null) {
            const preferenceSet = await repo.preferenceSet(contact.rolePreferenceId);
            if (!preferenceSet || preferenceSet.roleKey !== role.key)
                return '所选偏好方案不属于当前角色';
        }
        return null;
    },
    async resolveRoleForContact(contact) {
        if (contact.roleMode === 'custom') {
            return {
                key: `contact_custom_${contact.id}`,
                label: contact.customRoleLabel,
                defaultPreference: '',
                customPreference: contact.customRolePreference,
                roleProfileKey: '',
                roleProfileDescription: '',
                dsgEnabled: false,
                dsgSkills: [],
                usageCount: 0,
                preferenceSets: [],
                updatedAt: contact.updatedAt,
            };
        }
        const role = await repo.role(contact.roleKey);
        if (!role)
            return null;
        const preferenceSet = contact.rolePreferenceId == null ? null : await repo.preferenceSet(contact.rolePreferenceId);
        if (preferenceSet && preferenceSet.roleKey !== role.key)
            return null;
        return { ...role, customPreference: preferenceSet?.content ?? '' };
    },
    async updateContactsActive(ids, active) {
        if (!ids.length)
            return [];
        const placeholders = ids.map(() => '?').join(', ');
        await db.execute({ sql: `UPDATE contacts SET active = ?, updated_at = ? WHERE id IN (${placeholders})`, args: [active ? 1 : 0, now(), ...ids] });
        const result = await db.execute({ sql: `SELECT * FROM contacts WHERE id IN (${placeholders})`, args: ids });
        const contacts = result.rows.map((row) => mapContact(rowObject(row, result.columns)));
        const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
        return ids.flatMap((id) => contactMap.get(id) ? [contactMap.get(id)] : []);
    },
    async deleteContact(id) {
        const result = await db.execute({ sql: 'DELETE FROM contacts WHERE id = ?', args: [id] });
        return result.rowsAffected > 0;
    },
    async deleteInactiveContacts(ids) {
        if (!ids.length)
            return [];
        const placeholders = ids.map(() => '?').join(', ');
        const matching = await db.execute({ sql: `SELECT id FROM contacts WHERE active = 0 AND id IN (${placeholders})`, args: ids });
        const deletedIds = matching.rows.map((row) => numericValue(value(row, 'id')));
        if (!deletedIds.length)
            return [];
        const deletedPlaceholders = deletedIds.map(() => '?').join(', ');
        await db.execute({ sql: `DELETE FROM contacts WHERE active = 0 AND id IN (${deletedPlaceholders})`, args: deletedIds });
        return deletedIds;
    },
    async createInputRecord(sourceType, filename, normalizedText) {
        const result = await db.execute({ sql: `INSERT INTO input_records (source_type, filename, normalized_text, created_at) VALUES (?, ?, ?, ?)`, args: [sourceType, filename, normalizedText, now()] });
        return numericValue(result.lastInsertRowid);
    },
    async createGenerationRecord(inputRecordId, contactId, roleKey, draftContent) {
        const result = await db.execute({ sql: `INSERT INTO generation_records (input_record_id, contact_id, role_key, draft_content, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)`, args: [inputRecordId, contactId, roleKey, draftContent, now()] });
        return numericValue(result.lastInsertRowid);
    },
    async createSendRecord(input) {
        const result = await db.execute({ sql: `
      INSERT INTO send_records (generation_record_id, contact_id, delivery_type, webhook_url, payload, response_status, response_body, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, args: [input.generationRecordId, input.contactId, input.deliveryType ?? 'generic_webhook', input.webhookUrl, JSON.stringify(input.payload), input.responseStatus ?? null, input.responseBody ?? '', input.error ?? '', now()] });
        return numericValue(result.lastInsertRowid);
    },
    async records() {
        const [generations, sends] = await Promise.all([
            db.execute(`SELECT g.*, c.name AS contact_name FROM generation_records g LEFT JOIN contacts c ON c.id = g.contact_id ORDER BY g.id DESC LIMIT 30`),
            db.execute(`SELECT s.*, c.name AS contact_name FROM send_records s LEFT JOIN contacts c ON c.id = s.contact_id ORDER BY s.id DESC LIMIT 30`),
        ]);
        return {
            generations: generations.rows.map((row) => rowObject(row, generations.columns)),
            sends: sends.rows.map((row) => rowObject(row, sends.columns)),
        };
    },
};
