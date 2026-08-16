#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

function usage() {
  console.error('Usage: node send_webhook.mjs --messages messages.json [--output results.json] [--dry-run]');
  process.exit(1);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const messagesPath = arg('--messages');
const outputPath = arg('--output');
const dryRun = process.argv.includes('--dry-run');

if (!messagesPath) usage();

const input = JSON.parse(await readFile(messagesPath, 'utf8'));
const messages = Array.isArray(input) ? input : input.messages;

if (!Array.isArray(messages) || messages.length === 0) {
  throw new Error('Messages input must contain a non-empty messages array.');
}

for (const [index, message] of messages.entries()) {
  if (message.confirmed !== true) {
    throw new Error(`Message ${index + 1} is not confirmed. Set confirmed: true only after human approval.`);
  }
  if (!message.webhookUrl) {
    throw new Error(`Message ${index + 1} is missing webhookUrl.`);
  }
  if (!String(message.content ?? '').trim()) {
    throw new Error(`Message ${index + 1} is missing content.`);
  }
}

const results = [];
for (const message of messages) {
  const payload = {
    source: 'interchange-agent-skills-v2',
    recipient: message.recipient ?? '',
    role: message.role ?? '',
    content: message.content,
    sentAt: new Date().toISOString(),
  };

  if (dryRun) {
    results.push({ recipient: payload.recipient, role: payload.role, ok: true, dryRun: true, payload });
    continue;
  }

  try {
    const response = await fetch(message.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    results.push({
      recipient: payload.recipient,
      role: payload.role,
      ok: response.ok,
      status: response.status,
      responseBody: responseBody.slice(0, 2000),
    });
  } catch (error) {
    results.push({
      recipient: payload.recipient,
      role: payload.role,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const output = `${JSON.stringify({ results }, null, 2)}\n`;
if (outputPath) {
  await writeFile(outputPath, output, 'utf8');
} else {
  process.stdout.write(output);
}
