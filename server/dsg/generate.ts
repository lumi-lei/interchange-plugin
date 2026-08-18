import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { resolveSkillSourceDir } from './catalog.js';
import { renderAgentCordis, renderPresetMeta } from './template.js';
import type { RoleRow } from '../db.js';

const OWNER_FILE = 'interchange-role.json';

function hashKey(key: string) {
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

// 生成符合 DSH preset id 约束（[a-z0-9][a-z0-9-]*）的 slug；中文等会塌缩为空 → 回退 'role'。
export function slugifyPresetId(label: string): string {
  const normalized = label
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'role';
}

async function readOwner(dir: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(dir, OWNER_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.roleKey === 'string' ? parsed.roleKey : null;
  } catch {
    return null;
  }
}

async function listPresetDirs(): Promise<string[]> {
  try {
    const entries = await readdir(config.agentPresetsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function findOwnedPresetDir(roleKey: string): Promise<string | null> {
  for (const name of await listPresetDirs()) {
    const dir = path.join(config.agentPresetsDir, name);
    if ((await readOwner(dir)) === roleKey) return dir;
  }
  return null;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function resolvePresetId(label: string, roleKey: string): Promise<string> {
  const base = slugifyPresetId(label);
  const dir = path.join(config.agentPresetsDir, base);
  const owner = await readOwner(dir);
  if (owner === roleKey) return base; // 本角色所有 → 幂等复用 base
  if (owner !== null) return `${base}-${hashKey(roleKey)}`; // 他人所有（有标记）→ hash
  // 无标记：目录不存在则用 base；目录存在但无我们标记 = 外来预设 → hash，绝不覆盖。
  return (await dirExists(dir)) ? `${base}-${hashKey(roleKey)}` : base;
}

async function copySkill(name: string, presetSkillsDir: string): Promise<boolean> {
  const source = await resolveSkillSourceDir(name);
  if (!source) return false;
  try {
    const info = await stat(source);
    if (info.isDirectory()) {
      await cp(source, path.join(presetSkillsDir, name), { recursive: true });
    } else {
      await cp(source, path.join(presetSkillsDir, path.basename(source)));
    }
    return true;
  } catch {
    return false;
  }
}

export type PresetWriteResult = {
  presetId: string;
  presetDir: string;
  copiedSkills: number;
  skippedSkills: string[];
};

export async function writeRolePreset(role: Pick<RoleRow, 'key' | 'label' | 'defaultPreference' | 'dsgEnabled' | 'dsgSkills'>): Promise<PresetWriteResult | null> {
  if (!role.dsgEnabled) {
    await removeRolePreset(role.key);
    return null;
  }

  const presetId = await resolvePresetId(role.label, role.key);
  const presetDir = path.join(config.agentPresetsDir, presetId);

  // 清理该角色可能存在的旧预设目录（例如改名导致 id 变化），再重建目标目录。
  const owned = await findOwnedPresetDir(role.key);
  if (owned && path.resolve(owned) !== path.resolve(presetDir)) {
    await rm(owned, { recursive: true, force: true });
  }

  await rm(presetDir, { recursive: true, force: true });
  await mkdir(presetDir, { recursive: true });

  const selection = {
    roleLabel: role.label,
    defaultPreference: role.defaultPreference,
    workspaceDir: config.dsgWorkspaceDir,
  };

  await writeFile(path.join(presetDir, 'agent.cordis.yml'), renderAgentCordis(selection), 'utf8');
  await writeFile(path.join(presetDir, 'preset.yml'), renderPresetMeta(role.label, role.dsgSkills.length), 'utf8');
  await writeFile(path.join(presetDir, OWNER_FILE), JSON.stringify({ roleKey: role.key }), 'utf8');

  // 技能目录：仅复制勾选的技能；core/scripts 随 7 个 interchange 技能的相对引用始终复制。
  const presetSkillsDir = path.join(presetDir, 'skills');
  await mkdir(presetSkillsDir, { recursive: true });
  let copiedSkills = 0;
  const skippedSkills: string[] = [];
  for (const name of role.dsgSkills) {
    if (await copySkill(name, presetSkillsDir)) copiedSkills += 1;
    else skippedSkills.push(name);
  }

  await cp(path.join(process.cwd(), 'core'), path.join(presetDir, 'core'), { recursive: true });
  await cp(path.join(process.cwd(), 'scripts'), path.join(presetDir, 'scripts'), { recursive: true });

  return { presetId, presetDir, copiedSkills, skippedSkills };
}

export async function removeRolePreset(roleKey: string): Promise<string | null> {
  const owned = await findOwnedPresetDir(roleKey);
  if (!owned) return null;
  await rm(owned, { recursive: true, force: true });
  return owned;
}

export async function regenerateAll(roles: Pick<RoleRow, 'key' | 'label' | 'defaultPreference' | 'dsgEnabled' | 'dsgSkills'>[]): Promise<{ regenerated: number }> {
  let regenerated = 0;
  for (const role of roles) {
    if (!role.dsgEnabled) continue;
    await writeRolePreset(role);
    regenerated += 1;
  }
  return { regenerated };
}
