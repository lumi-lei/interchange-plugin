---
name: interchange-message-transformer
description: Transform objective project facts into role-specific Chinese message drafts without requiring an Interchange server or model API key. Use when a user wants AI coding tools to rewrite the same source information for product, QA, tech leads, department leaders, customers, the user's AI coding tool, or a teammate's AI coding tool.
---

# Interchange Message Transformer

Use the current AI tool's own reasoning and language model capability. Do not call DeepSeek, OpenAI, or the local Interchange server unless the user explicitly asks for connected mode.

## Inputs

- Objective source facts from the user, project files, docs, tests, issue text, or meeting notes.
- Target roles or recipient types. If none are specified, ask which roles to draft for.
- Optional speaking preferences supplied by the user.

## Workflow

1. Read `../../core/roles.md`, `../../core/workflow.md`, and `../../core/confirmation-policy.md`.
2. Gather facts from the provided source. If the user asks you to infer facts from a codebase, inspect the relevant files before drafting.
3. Separate confirmed facts from assumptions and open questions.
4. Create one draft per target role using the role focus and prompt patterns.
5. Preserve facts exactly. Do not invent owners, dates, commitments, release status, or business conclusions.
6. Include a needs-confirmation section only when the source information is insufficient for a recipient to act.
7. Show all drafts to the user for review. Do not send them.

## Output

Return editable drafts grouped by role:

```md
## Product
...

## QA
...

## My AI Coding Tool
...
```

For machine-readable handoff, use `../../scripts/format_drafts.mjs` after drafting.
