---
name: interchange-openspec-workflow
description: Create OpenSpec-like project change artifacts from objective facts. Use when preparing proposal, context, design, tasks, delta spec, or archive notes for an AI-assisted development change without requiring a local Interchange server.
---

# Interchange OpenSpec Workflow

Use this skill to turn a change request into reviewable artifacts before implementation.

## Workflow

1. Read `../../core/openspec-like.md`, `../../core/workflow.md`, and `../../core/confirmation-policy.md`.
2. Gather source facts from user-provided requirements, docs, code, tests, or issue text.
3. Create only the artifacts the user asks for. If unspecified, produce a compact change package in one response.
4. Keep facts, assumptions, and open questions separate.
5. Do not claim implementation has happened unless verified from code or user confirmation.

## Default Artifact Set

```text
proposal.md
context.md
design.md
tasks.md
delta-spec.md
```

## Artifact Requirements

- `proposal.md`: why, goals, non-goals, acceptance criteria.
- `context.md`: relevant code, docs, business rules, risks.
- `design.md`: intended approach and interfaces.
- `tasks.md`: executable checklist.
- `delta-spec.md`: added, modified, removed capabilities.
