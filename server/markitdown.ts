import { execFile, type ExecFileException } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';

export type MarkItDownInput = {
  buffer: Buffer;
  originalname?: string;
  filename?: string;
};

export type MarkItDownErrorType = 'command_not_found' | 'timeout' | 'failed' | 'empty_output';

export type MarkItDownResult =
  | { ok: true; text: string }
  | { ok: false; type: MarkItDownErrorType; message: string; stderr?: string };

type ExecFileFailure = {
  error: ExecFileException;
  stdout: string;
  stderr: string;
};

const diagnosticLimit = 500;
const markitdownTempArtifactPattern = /(?:[A-Za-z]:)?[^\s"'<>]*interchange-markitdown-[^\s"'<>]*/g;
const missingCliMessage =
  "MarkItDown CLI is not available. Install it with pip install 'markitdown[all]' or configure MARKITDOWN_COMMAND.";

function truncateDiagnostic(text: string, tempDir = '') {
  const cwd = process.cwd();
  const tmp = os.tmpdir();
  const sanitized = text
    .replace(markitdownTempArtifactPattern, '[path]')
    .replaceAll(tempDir, '[path]')
    .replaceAll(cwd, '[path]')
    .replaceAll(tmp, '[path]');
  return sanitized.length > diagnosticLimit ? `${sanitized.slice(0, diagnosticLimit)}...` : sanitized;
}

function fileNameForInput(input: MarkItDownInput) {
  const candidate = input.originalname ?? input.filename ?? 'upload';
  return path.basename(candidate) || 'upload';
}

function runMarkItDown(command: string, inputPath: string, outputPath: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject: (failure: ExecFileFailure) => void) => {
    execFile(
      command,
      [inputPath, '-o', outputPath],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: config.markitdownTimeoutMs,
      },
      (error, stdout, stderr) => {
        const output = {
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        };

        if (error) {
          reject({ error, ...output });
          return;
        }

        resolve(output);
      },
    );
  });
}

function classifyExecFailure(failure: ExecFileFailure, tempDir: string): MarkItDownResult {
  const { error, stderr } = failure;
  const code = typeof error.code === 'string' ? error.code : String(error.code ?? '');
  const diagnostic = truncateDiagnostic(stderr.trim() || error.message, tempDir);
  const stderrText = truncateDiagnostic(stderr.trim(), tempDir);

  if (code === 'ENOENT') {
    return { ok: false, type: 'command_not_found', message: missingCliMessage };
  }

  if (error.killed || error.signal === 'SIGTERM') {
    const message = `MarkItDown conversion timed out after ${config.markitdownTimeoutMs}ms.`;
    return { ok: false, type: 'timeout', message, stderr: stderrText || undefined };
  }

  return {
    ok: false,
    type: 'failed',
    message: `MarkItDown conversion failed${code ? ` (${code})` : ''}${diagnostic ? `: ${diagnostic}` : '.'}`,
    stderr: stderrText || undefined,
  };
}

async function readMarkdownOutput(outputPath: string, stdout: string) {
  let output = '';

  try {
    output = await readFile(outputPath, 'utf8');
  } catch (error) {
    if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return (output || stdout).trim();
}

export async function convertWithMarkItDown(input: MarkItDownInput): Promise<MarkItDownResult> {
  let tempDir = '';

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'interchange-markitdown-'));
    const inputPath = path.join(tempDir, fileNameForInput(input));
    const outputPath = path.join(tempDir, 'output.md');
    await writeFile(inputPath, input.buffer);

    const { stdout, stderr } = await runMarkItDown(config.markitdownCommand, inputPath, outputPath);
    const text = await readMarkdownOutput(outputPath, stdout);
    if (!text) {
      const stderrText = truncateDiagnostic(stderr.trim(), tempDir);
      return {
        ok: false,
        type: 'empty_output',
        message: stderrText ? `MarkItDown returned empty output: ${stderrText}` : 'MarkItDown returned empty output.',
        stderr: stderrText || undefined,
      };
    }

    return { ok: true, text };
  } catch (error) {
    if (error && typeof error === 'object' && 'error' in error) {
      return classifyExecFailure(error as ExecFileFailure, tempDir);
    }

    const message = truncateDiagnostic(error instanceof Error ? error.message : String(error), tempDir);
    return { ok: false, type: 'failed', message: `MarkItDown could not run: ${message}` };
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}
