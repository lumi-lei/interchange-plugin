import { describe, expect, it } from 'vitest';
import { findRoleFocusPresetByName, roleFocusPresets } from '../server/roles.js';

describe('role focus presets', () => {
  it.each([
    ['产品经理', 'product'],
    ['测试工程师', 'qa'],
    ['技术负责人', 'tech_lead'],
    ['管理层', 'department_leader'],
    ['甲方', 'customer'],
    ['主执行 AI', 'my_ai_coding_tool'],
    ['协作 AI', 'teammate_ai_coding_tool'],
  ])('matches %s to the %s local focus preset', (alias, key) => {
    expect(findRoleFocusPresetByName(alias)).toMatchObject({ key });
  });

  it('only exposes workflow templates for AI coding presets', () => {
    expect(roleFocusPresets.find((preset) => preset.key === 'product')?.preferenceTemplates).toBeUndefined();
    expect(roleFocusPresets.find((preset) => preset.key === 'my_ai_coding_tool')?.preferenceTemplates?.[0]).toMatchObject({
      name: '主执行 AI 编程工作流',
    });
  });
});
