import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(rootDir, 'plugin', 'runtime');
const artifacts = [
  ['dist-server/server', 'server'],
  ['dist', 'dist'],
  ['skills', 'skills'],
  ['core', 'core'],
  ['scripts', 'scripts'],
];

for (const [source] of artifacts) {
  const sourcePath = path.join(rootDir, source);
  try {
    await stat(sourcePath);
  } catch {
    throw new Error(`缺少构建产物或运行时资源：${source}。请先执行 npm run build。`);
  }
}

await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

for (const [source, destination] of artifacts) {
  await cp(path.join(rootDir, source), path.join(runtimeDir, destination), { recursive: true });
}

console.log(`已生成插件运行时：${runtimeDir}`);
