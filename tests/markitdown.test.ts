import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecFileException } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { convertWithMarkItDown } from '../server/markitdown.js';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: execFileMock,
  };
});

describe('convertWithMarkItDown', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs the MarkItDown CLI with a temp file and returns trimmed stdout', async () => {
    mockMarkItDown({ stdout: '  # Release notes\n\n- Preserve Markdown  \n' });

    const result = await convertWithMarkItDown({
      originalname: 'release.docx',
      buffer: Buffer.from('docx-ish'),
    });

    expect(result).toEqual({ ok: true, text: '# Release notes\n\n- Preserve Markdown' });
    expectMarkItDownCall('release.docx');
  });

  it('prefers output.md when the CLI writes a file', async () => {
    const { getTempDir } = mockMarkItDown({ outputFile: '  # From output file  \n', stdout: '# From stdout' });

    const result = await convertWithMarkItDown({
      originalname: 'release.docx',
      buffer: Buffer.from('docx-ish'),
    });

    expect(result).toEqual({ ok: true, text: '# From output file' });
    expectMarkItDownCall('release.docx');
    expect(existsSync(getTempDir())).toBe(false);
  });

  it('returns a failure result when MarkItDown output is empty', async () => {
    mockMarkItDown({ outputFile: '   \n  ' });

    await expect(convertWithMarkItDown({ originalname: 'empty.pdf', buffer: Buffer.from('') })).resolves.toEqual({
      ok: false,
      type: 'empty_output',
      message: 'MarkItDown returned empty output.',
    });
  });

  it('returns a failure result when the MarkItDown command is missing', async () => {
    const { getTempDir } = mockMarkItDown({
      error: Object.assign(new Error('spawn markitdown ENOENT'), { code: 'ENOENT' }) as ExecFileException,
    });

    await expect(convertWithMarkItDown({ originalname: 'brief.pdf', buffer: Buffer.from('pdf-ish') })).resolves.toEqual({
      ok: false,
      type: 'command_not_found',
      message:
        "MarkItDown CLI is not available. Install it with pip install 'markitdown[all]' or configure MARKITDOWN_COMMAND.",
    });
    expect(existsSync(getTempDir())).toBe(false);
  });

  it('returns a timeout failure when the CLI exceeds its timeout', async () => {
    mockMarkItDown({
      error: Object.assign(new Error('Command timed out'), { killed: true, signal: 'SIGTERM' }) as ExecFileException,
      stderr: 'still converting',
    });

    await expect(convertWithMarkItDown({ originalname: 'brief.pdf', buffer: Buffer.from('pdf-ish') })).resolves.toEqual({
      ok: false,
      type: 'timeout',
      message: `MarkItDown conversion timed out after ${config.markitdownTimeoutMs}ms.`,
      stderr: 'still converting',
    });
  });

  it('truncates stderr in failure diagnostics', async () => {
    const stderr = 'x'.repeat(1500);
    mockMarkItDown({
      error: Object.assign(new Error('Command failed'), { code: 1 }) as ExecFileException,
      stderr,
    });

    const result = await convertWithMarkItDown({ originalname: 'brief.pdf', buffer: Buffer.from('pdf-ish') });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeLessThan(stderr.length);
      expect(result.type).toBe('failed');
      expect(result.stderr).toHaveLength(503);
      expect(result.stderr).toMatch(/\.\.\.$/);
    }
  });

  it('does not expose temp paths in failure diagnostics', async () => {
    mockMarkItDown({
      error: Object.assign(new Error('Command failed'), { code: 1 }) as ExecFileException,
      stderr: 'Cannot read C:\\Users\\HQ\\AppData\\Local\\Temp\\interchange-markitdown-secret\\brief.pdf',
    });

    const result = await convertWithMarkItDown({ originalname: 'brief.pdf', buffer: Buffer.from('pdf-ish') });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('[path]');
      expect(result.message).not.toContain('C:\\Users\\HQ\\AppData\\Local\\Temp');
    }
  });
});

function mockMarkItDown({
  error = null,
  stdout = '',
  stderr = '',
  outputFile,
}: {
  error?: ExecFileException | null;
  stdout?: string;
  stderr?: string;
  outputFile?: string;
}) {
  let tempDir = '';
  execFileMock.mockImplementationOnce(
    (
      _command: string,
      args: string[],
      _options: unknown,
      callback: (error: ExecFileException | null, stdout?: string, stderr?: string) => void,
    ) => {
      tempDir = path.dirname(args[0]);
      if (outputFile !== undefined) {
        writeFileSync(args[2], outputFile);
      }
      callback(error, stdout, stderr);
      return {};
    },
  );
  return { getTempDir: () => tempDir };
}

function expectMarkItDownCall(filename: string) {
  expect(execFileMock).toHaveBeenCalledWith(
    config.markitdownCommand,
    [expect.stringMatching(new RegExp(`${filename}$`)), '-o', expect.stringMatching(/output\.md$/)],
    expect.objectContaining({ timeout: config.markitdownTimeoutMs, maxBuffer: 10 * 1024 * 1024 }),
    expect.any(Function),
  );
  const options = execFileMock.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  expect(options).not.toHaveProperty('shell');
}
