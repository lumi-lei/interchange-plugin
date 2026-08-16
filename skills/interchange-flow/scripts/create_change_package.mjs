#!/usr/bin/env node
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function usage() {
  console.error('Usage: node create_change_package.mjs --id <change-id> --domain <domain> --goal "<goal>" [--root interchange] [--force]');
  process.exit(1);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function kebab(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeNew(filePath, content, force) {
  if (!force && await exists(filePath)) {
    return false;
  }
  await writeFile(filePath, content, 'utf8');
  return true;
}

const id = kebab(arg('--id'));
const domain = kebab(arg('--domain', 'general')) || 'general';
const goal = arg('--goal');
const root = arg('--root', 'interchange');
const force = hasFlag('--force');

if (!id || !goal) usage();

const changeDir = path.join(root, 'changes', id);
const contextDir = path.join(root, 'context');
const specsDir = path.join(root, 'specs', domain);
const archiveDir = path.join(root, 'archive');

await mkdir(changeDir, { recursive: true });
await mkdir(contextDir, { recursive: true });
await mkdir(specsDir, { recursive: true });
await mkdir(archiveDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const files = {
  'change.yaml': `id: ${id}
domain: ${domain}
goal: ${JSON.stringify(goal)}
status: proposed
created_at: ${today}
sources: []
targets: []
`,
  'proposal.md': `# Proposal: ${id}

## Background

## Goals

- ${goal}

## Non-Goals

## Affected Scope

## Source Material

## Risks

## Acceptance Criteria

## Open Questions
`,
  'context.md': `# Context: ${id}

## Goal

${goal}

## Must-Read Specs

- ${root}/specs/${domain}/

## Must-Read Docs

## Must-Read Code

## Confirmed Rules

## Constraints

## Verification Commands

## Risks

## Open Questions
`,
  'design.md': `# Design: ${id}

## Approach

## Interfaces

## Data Flow

## Failure Modes

## Compatibility

## Alternatives Considered
`,
  'tasks.md': `# Tasks: ${id}

- [ ] Confirm scope and open questions.
- [ ] Implement code changes.
- [ ] Update or add tests.
- [ ] Run verification.
- [ ] Update implementation notes.
- [ ] Prepare archive.
`,
  'delta-spec.md': `# Delta Spec: ${id}

## ADDED

## MODIFIED

## REMOVED

## Affected Specs

- ${root}/specs/${domain}/

## Questions Needing Confirmation
`,
  'implementation-notes.md': `# Implementation Notes: ${id}

## Summary

## Files Changed

## Decisions

## Verification

## Follow-Ups
`,
  'review.md': `# Review: ${id}

## Human Confirmation

## AI Review Notes

## Risks Accepted

## Archive Readiness
`,
};

const written = [];
const skipped = [];

for (const [name, content] of Object.entries(files)) {
  const filePath = path.join(changeDir, name);
  if (await writeNew(filePath, content, force)) {
    written.push(filePath);
  } else {
    skipped.push(filePath);
  }
}

await writeNew(path.join(contextDir, 'index.md'), '# Interchange Context Index\n\n## Project Map\n\n## Source Index\n\n## Active Changes\n', false);
await writeNew(path.join(contextDir, 'source-index.md'), '# Source Index\n\n| Title | Domain | Status | Source | Applies To |\n| --- | --- | --- | --- | --- |\n', false);
await writeNew(path.join(specsDir, 'capability.md'), `# ${domain} Capability\n\n## Scope\n\n## Current Behavior\n\n## Business Rules\n\n## Interfaces\n\n## Tests\n\n## Sources\n`, false);

process.stdout.write(JSON.stringify({
  root,
  changeDir,
  written,
  skipped,
}, null, 2));
process.stdout.write('\n');
