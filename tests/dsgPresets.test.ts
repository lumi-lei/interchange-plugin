import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tempRoot: string;
let dshHome: string;
let presetsDir: string;
let generate: typeof import('../server/dsg/generate.js');
let template: typeof import('../server/dsg/template.js');
let catalog: typeof import('../server/dsg/catalog.js');

type PresetRole = {
  key: string;
  label: string;
  defaultPreference: string;
  dsgEnabled: boolean;
  dsgSkills: string[];
};

function makeRole(overrides: Partial<PresetRole> = {}): PresetRole {
  return {
    key: 'custom_test_role_1',
    label: '测试工程师',
    defaultPreference: '关注测试范围。',
    dsgEnabled: true,
    dsgSkills: ['interchange-message-transformer'],
    ...overrides,
  };
}

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'dsg-test-'));
  dshHome = path.join(tempRoot, 'home');
  presetsDir = path.join(dshHome, '.agent-presets');
  await mkdir(presetsDir, { recursive: true });

  // 在导入 config 前注入隔离的 DSH home 与预设根，避免测试读写真实 ~/.dsh。
  process.env.DSH_HOME = dshHome;
  process.env.DSG_PRESETS_DIR = presetsDir;
  vi.resetModules();
  generate = await import('../server/dsg/generate.js');
  template = await import('../server/dsg/template.js');
  catalog = await import('../server/dsg/catalog.js');
});

afterAll(async () => {
  vi.resetModules();
  delete process.env.DSH_HOME;
  delete process.env.DSG_PRESETS_DIR;
  await rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(presetsDir, { recursive: true, force: true });
  await mkdir(presetsDir, { recursive: true });
});

describe('slugifyPresetId', () => {
  it('falls back to "role" for non-latin labels', () => {
    expect(generate.slugifyPresetId('产品经理')).toBe('role');
  });

  it('lowercases and dashes latin labels', () => {
    expect(generate.slugifyPresetId('QA Engineer')).toBe('qa-engineer');
  });

  it('collapses separators and trims leading/trailing dashes', () => {
    expect(generate.slugifyPresetId('  Test--Role  ')).toBe('test-role');
  });
});

describe('renderAgentCordis', () => {
  it('always includes the full toolset plus mandatory skills', () => {
    const yml = template.renderAgentCordis({
      roleLabel: '测试工程师',
      defaultPreference: '关注测试范围。',
      workspaceDir: 'D:/code/interchange-harness',
    });
    expect(yml).toContain('- id: tool-bash');
    expect(yml).toContain('- id: tool-fs');
    expect(yml).toContain('- id: interchange-tools');
    expect(yml).toContain('workspaceDir: D:/code/interchange-harness');
    expect(yml).toContain('includeDefaultRoots: false');
    expect(yml).toContain('customSkillDirs');
    expect(yml).toContain('测试工程师');
    expect(yml).toContain('关注测试范围。');
    // 完整工具集：这些组也必须存在。
    expect(yml).toContain('- id: tool-goal');
    expect(yml).toContain('- id: delegation');
    expect(yml).toContain('- id: planning');
    expect(yml).toContain('- id: tool-subagent');
    expect(yml).toContain('- id: tool-workflow');
    expect(yml).toContain('- id: tool-ralph');
  });
});

describe('writeRolePreset', () => {
  it('writes a complete preset directory with only the selected skills', async () => {
    const result = await generate.writeRolePreset(makeRole());
    expect(result).not.toBeNull();
    const dir = path.join(presetsDir, result!.presetId);
    const entries = await readdir(dir);
    for (const expected of ['agent.cordis.yml', 'preset.yml', 'interchange-role.json', 'skills', 'core', 'scripts']) {
      expect(entries).toContain(expected);
    }
    const skillDirs = await readdir(path.join(dir, 'skills'));
    expect(skillDirs).toEqual(['interchange-message-transformer']);
    const yml = await readFile(path.join(dir, 'agent.cordis.yml'), 'utf8');
    expect(yml).toContain('includeDefaultRoots: false');
    const owner = JSON.parse(await readFile(path.join(dir, 'interchange-role.json'), 'utf8'));
    expect(owner.roleKey).toBe('custom_test_role_1');
  });

  it('skips generation when dsgEnabled is false', async () => {
    const result = await generate.writeRolePreset(makeRole({ dsgEnabled: false }));
    expect(result).toBeNull();
    expect(await readdir(presetsDir)).toEqual([]);
  });

  it('rebuilds under a new id when the label is renamed', async () => {
    await generate.writeRolePreset(makeRole({ key: 'custom_rename', label: 'Alpha' }));
    expect(await readdir(presetsDir)).toContain('alpha');
    await generate.writeRolePreset(makeRole({ key: 'custom_rename', label: 'Beta' }));
    const entries = await readdir(presetsDir);
    expect(entries).toContain('beta');
    expect(entries).not.toContain('alpha');
  });

  it('does not overwrite a foreign preset with the same id', async () => {
    const foreign = path.join(presetsDir, 'role');
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, 'preset.yml'), 'name: Foreign\n', 'utf8');
    const result = await generate.writeRolePreset(makeRole({ label: '产品经理' }));
    expect(result!.presetId.startsWith('role-')).toBe(true);
    expect(result!.presetId).not.toBe('role');
    const foreignContent = await readFile(path.join(foreign, 'preset.yml'), 'utf8');
    expect(foreignContent).toContain('Foreign');
  });
});

describe('removeRolePreset', () => {
  it('removes only the preset it owns', async () => {
    await generate.writeRolePreset(makeRole());
    const removed = await generate.removeRolePreset('custom_test_role_1');
    expect(removed).not.toBeNull();
    expect(await readdir(presetsDir)).toEqual([]);
    expect(await generate.removeRolePreset('custom_test_role_1')).toBeNull();
  });

  it('does not remove a foreign preset without the owner marker', async () => {
    const foreign = path.join(presetsDir, 'someone-else');
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, 'preset.yml'), 'name: Other\n', 'utf8');
    await generate.removeRolePreset('custom_test_role_1');
    expect(await readdir(presetsDir)).toContain('someone-else');
  });
});

describe('discoverCatalog', () => {
  it('discovers interchange + global skills with their sources', async () => {
    const globalSkills = path.join(dshHome, 'skills');
    await mkdir(path.join(globalSkills, 'my-global'), { recursive: true });
    await writeFile(
      path.join(globalSkills, 'my-global', 'SKILL.md'),
      '---\nname: my-global\ndescription: A global test skill.\n---\n\n# body\n',
      'utf8',
    );
    const cat = await catalog.discoverCatalog();
    const names = cat.skills.map((skill) => skill.name);
    expect(names).toContain('interchange-message-transformer');
    expect(names).toContain('my-global');
    expect(cat.skills.find((skill) => skill.name === 'interchange-message-transformer')?.source).toBe('interchange');
    expect(cat.skills.find((skill) => skill.name === 'my-global')?.source).toBe('global');
  });
});
