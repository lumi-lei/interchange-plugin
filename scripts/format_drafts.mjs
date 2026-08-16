#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

function usage() {
  console.error('Usage: node format_drafts.mjs --input drafts.json [--format markdown|json] [--output file]');
  process.exit(1);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const inputPath = arg('--input');
const format = arg('--format', 'markdown');
const outputPath = arg('--output');

if (!inputPath || !['markdown', 'json'].includes(format)) usage();

const raw = await readFile(inputPath, 'utf8');
const parsed = JSON.parse(raw);
const drafts = Array.isArray(parsed) ? parsed : parsed.drafts;

if (!Array.isArray(drafts)) {
  throw new Error('Input must be an array or an object with a drafts array.');
}

const normalized = drafts.map((draft, index) => ({
  role: draft.role ?? draft.roleKey ?? `draft-${index + 1}`,
  recipient: draft.recipient ?? draft.contact?.name ?? '',
  content: String(draft.content ?? draft.editedContent ?? '').trim(),
}));

let output;
if (format === 'json') {
  output = `${JSON.stringify({ drafts: normalized }, null, 2)}\n`;
} else {
  output = normalized
    .map((draft) => {
      const title = draft.recipient ? `${draft.role} - ${draft.recipient}` : draft.role;
      return `## ${title}\n\n${draft.content || '_Empty draft_'}\n`;
    })
    .join('\n');
}

if (outputPath) {
  await writeFile(outputPath, output, 'utf8');
} else {
  process.stdout.write(output);
}
