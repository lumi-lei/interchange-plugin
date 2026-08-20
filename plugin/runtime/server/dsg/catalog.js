import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
// 仓库自带的 7 个 interchange 技能所在目录。
function repoSkillsDir() {
    return path.join(process.cwd(), 'skills');
}
function dshSkillsDir() {
    return path.join(config.dshHome, 'skills');
}
function projectSkillsDir() {
    return path.join(process.cwd(), '.dsh', 'skills');
}
// 最小 frontmatter 提取器：只解析 `---` 块内的单行 name/description 标量。
// 解析失败回退 name=目录名、description 为空。不引入 YAML 依赖。
export async function readSkillFrontmatter(filePath, fallbackName) {
    let text = '';
    try {
        text = await readFile(filePath, 'utf8');
    }
    catch {
        return { name: fallbackName, description: '' };
    }
    const normalized = text.replace(/^\uFEFF/, '');
    const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match)
        return { name: fallbackName, description: '' };
    let name = '';
    let description = '';
    let inName = false;
    let inDescription = false;
    for (const rawLine of match[1].split(/\r?\n/)) {
        const line = rawLine;
        const nameMatch = line.match(/^name\s*:\s*(.*)$/);
        if (nameMatch && !inDescription) {
            inName = true;
            name = nameMatch[1].trim();
            continue;
        }
        const descMatch = line.match(/^description\s*:\s*(.*)$/);
        if (descMatch) {
            inName = false;
            inDescription = true;
            description = descMatch[1].trim();
            continue;
        }
        if (inDescription && /^\s{2,}/.test(line)) {
            // description 的多行续写（缩进续行）
            description += ' ' + line.trim();
            continue;
        }
        if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
            inName = false;
            inDescription = false;
        }
    }
    const unquote = (value) => {
        const trimmed = value.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    };
    return { name: unquote(name) || fallbackName, description: unquote(description) };
}
async function listSkillEntries(root) {
    let entries = [];
    try {
        entries = await readdir(root);
    }
    catch {
        return [];
    }
    const result = [];
    for (const entry of entries) {
        const dir = path.join(root, entry);
        let isDir = false;
        try {
            isDir = (await stat(dir)).isDirectory();
        }
        catch {
            continue;
        }
        if (isDir) {
            // 目录 bundle：<name>/SKILL.md
            const skillFile = path.join(dir, 'SKILL.md');
            try {
                if (!(await stat(skillFile)).isFile())
                    continue;
            }
            catch {
                continue;
            }
            const meta = await readSkillFrontmatter(skillFile, entry);
            result.push({ ...meta, sourceDir: dir });
        }
        else if (entry.endsWith('.md')) {
            // 平铺 skill：<name>.md
            const meta = await readSkillFrontmatter(dir, entry.slice(0, -3));
            result.push({ ...meta, sourceDir: dir });
        }
    }
    return result;
}
export async function discoverCatalog() {
    const [interchangeEntries, globalEntries, projectEntries] = await Promise.all([
        listSkillEntries(repoSkillsDir()),
        listSkillEntries(dshSkillsDir()),
        listSkillEntries(projectSkillsDir()),
    ]);
    // 近者（interchange）遮蔽远者（project/global）的同名技能。
    const skills = new Map();
    for (const entry of projectEntries) {
        skills.set(entry.name, { name: entry.name, description: entry.description, source: 'project' });
    }
    for (const entry of globalEntries) {
        skills.set(entry.name, { name: entry.name, description: entry.description, source: 'global' });
    }
    for (const entry of interchangeEntries) {
        skills.set(entry.name, { name: entry.name, description: entry.description, source: 'interchange' });
    }
    return {
        skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
        agentPresetsDir: config.agentPresetsDir,
        workspaceDir: config.dsgWorkspaceDir,
    };
}
// 供生成器定位每个勾选技能的实际源目录（复制整目录用）。
export async function resolveSkillSourceDir(name) {
    const sources = [
        { root: repoSkillsDir(), source: 'interchange' },
        { root: dshSkillsDir(), source: 'global' },
        { root: projectSkillsDir(), source: 'project' },
    ];
    for (const { root } of sources) {
        const dir = path.join(root, name);
        try {
            if ((await stat(dir)).isDirectory())
                return dir;
        }
        catch { }
        const flat = path.join(root, `${name}.md`);
        try {
            if ((await stat(flat)).isFile())
                return flat;
        }
        catch { }
    }
    return null;
}
