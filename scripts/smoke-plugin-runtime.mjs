import { once } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(rootDir, 'plugin');
const npmCli = process.env.npm_execpath
  ?? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function execNpm(args, options = {}) {
  return execFileAsync(process.execPath, [npmCli, ...args], options);
}

async function allocatePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  server.close();
  if (!address || typeof address === 'string') throw new Error('无法分配本地测试端口。');
  return address.port;
}

async function waitForHealthy(port, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`打包后的运行时未通过健康检查。服务日志：${logs()}`);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'interchange-dsh-smoke-'));
let child;

try {
  const packDir = path.join(tempDir, 'pack');
  await mkdir(packDir);
  await execNpm(['pack', '--pack-destination', packDir], { cwd: pluginDir });

  const tarball = (await readdir(packDir)).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack 未生成插件 tarball。');
  await execNpm(['install', '--prefix', tempDir, '--ignore-scripts', path.join(packDir, tarball)]);

  const runtimeDir = path.join(tempDir, 'node_modules', 'interchange-dsh', 'runtime');
  const entry = path.join(runtimeDir, 'server', 'index.js');
  const hostEntry = path.join(tempDir, 'node_modules', 'interchange-dsh', 'host', 'index.js');
  await import(pathToFileURL(hostEntry).href);
  const port = await allocatePort();
  let output = '';
  child = spawn(process.execPath, [entry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: path.join(tempDir, 'state', 'interchange.sqlite'),
      DSH_HOME: path.join(tempDir, 'dsh-home'),
      DOTENV_CONFIG_PATH: path.join(tempDir, 'state', '.env'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  await waitForHealthy(port, () => output.trim());
  console.log('已通过插件 tarball 独立运行时健康检查。');
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
  await rm(tempDir, { recursive: true, force: true });
}
