#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const defaultBaseUrl = 'http://127.0.0.1:4120/api';

function usage() {
  console.error(`Usage:
  node interchange_api.mjs health [--base-url URL]
  node interchange_api.mjs roles [--base-url URL]
  node interchange_api.mjs contacts [--base-url URL]
  node interchange_api.mjs parse-text --text "..." [--base-url URL]
  node interchange_api.mjs generate --source-text "..." --contact-ids 1,2 [--input-record-id 3] [--base-url URL]
  node interchange_api.mjs send --messages messages.json [--base-url URL] [--dry-run]`);
  process.exit(1);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const command = process.argv[2];
const baseUrl = arg('--base-url', defaultBaseUrl).replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');

if (!command) usage();

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }
  return data;
}

async function main() {
  if (command === 'health') return request('/health');
  if (command === 'roles') return request('/roles');
  if (command === 'contacts') return request('/contacts');

  if (command === 'parse-text') {
    const text = arg('--text');
    if (!text) usage();
    const form = new FormData();
    form.append('text', text);
    return request('/inputs/parse', { method: 'POST', body: form });
  }

  if (command === 'generate') {
    const sourceText = arg('--source-text');
    const contactIds = arg('--contact-ids')
      .split(',')
      .filter(Boolean)
      .map((value) => Number(value));
    const inputRecordIdArg = arg('--input-record-id');
    if (!sourceText || contactIds.length === 0 || contactIds.some(Number.isNaN)) usage();
    return request('/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceText,
        inputRecordId: inputRecordIdArg ? Number(inputRecordIdArg) : null,
        contactIds,
      }),
    });
  }

  if (command === 'send') {
    const messagesPath = arg('--messages');
    if (!messagesPath) usage();
    const payload = JSON.parse(await readFile(messagesPath, 'utf8'));
    const messages = Array.isArray(payload) ? payload : payload.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages input must contain a non-empty messages array.');
    }
    for (const [index, message] of messages.entries()) {
      if (message.confirmed !== true) {
        throw new Error(`Message ${index + 1} is not confirmed. Connected Mode send requires confirmed: true.`);
      }
    }
    const apiPayload = {
      messages: messages.map((message) => ({
        generationRecordId: message.generationRecordId ?? null,
        contactId: message.contactId,
        content: message.content,
      })),
    };
    if (dryRun) return { dryRun: true, request: apiPayload };
    return request('/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(apiPayload),
    });
  }

  usage();
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Connected Mode unavailable or failed: ${message}\nUse no-config Standalone Mode unless the user wants to fix the local server.\n`);
  process.exit(1);
}
