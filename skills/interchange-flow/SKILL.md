---
name: interchange-flow
description: Run an OpenSpec-like Interchange workflow for AI-assisted project changes. Use when the user wants agreement before implementation, change packages, proposal/context/design/tasks/delta-spec files, confirmation before coding, implementation handoff context, or archiving verified changes into long-term project specs.
---

# Interchange Flow

Use this skill as the coordinator for an OpenSpec-like loop:

```text
explore -> propose -> context -> apply -> archive
```

This skill keeps planning artifacts, implementation context, and long-term project knowledge separate. It may call other Interchange skills when useful:

- `interchange-openspec-workflow` for proposal, design, tasks, and delta-spec drafting.
- `interchange-coding-context` for implementation-ready AI coding context.
- `interchange-human-confirmation` for review and approval boundaries.

## Required Rules

1. Do not modify product code before proposal, design, tasks, and delta-spec exist and the user explicitly confirms implementation.
2. Treat converted Markdown as source material, not authority. Prefer sources in this order: code/tests, reviewed specs, reviewed imported docs, raw imported docs, user notes, assumptions.
3. Keep facts, assumptions, risks, and open questions separate.
4. Scope each change to one primary outcome.
5. Archive only after implementation and verification are complete.

## Repository Layout

Use this default layout unless the user specifies another root:

```text
interchange/
  context/
    index.md
    project-map.md
    source-index.md
  specs/
    <domain>/
      capability.md
  changes/
    <change-id>/
      change.yaml
      proposal.md
      context.md
      design.md
      tasks.md
      delta-spec.md
      implementation-notes.md
      review.md
  archive/
```

If the repository already uses `orgspec/`, `openspec/`, or another planning root, follow the existing root.

## Phase Selection

Infer the phase from the user request:

- **explore**: understand a module, code path, converted Markdown, or existing specs.
- **propose**: create or update a change package.
- **context**: assemble a coding context bundle for an approved change.
- **apply**: implement the approved change.
- **archive**: merge verified delta-spec content into long-term specs and move the change to archive.
- **full loop**: run explore/propose/context, then pause for confirmation before apply.

For a new change request, default to `propose` and pause before coding.

## Scaffold a Change

When creating a new change package, prefer the bundled script:

```bash
node "__PRESET_DIR__\skills\interchange-flow\scripts\create_change_package.mjs" --id <change-id> --domain <domain> --goal "<goal>"
```

Optional flags:

```bash
--root interchange
--force
```

If the script is unavailable, create the files manually using `references/change-artifacts.md`.

## Explore

1. Read project instructions such as `AGENTS.md` if present.
2. Read `interchange/context/index.md`, `interchange/context/source-index.md`, and relevant `interchange/specs/<domain>/` files if present.
3. Inspect only code and docs relevant to the requested domain or change.
4. Update or create `interchange/changes/<change-id>/context.md` with:
   - goal
   - relevant specs/docs
   - relevant code paths
   - confirmed business rules
   - risks
   - open questions

## Propose

Create or update:

```text
proposal.md
context.md
design.md
tasks.md
delta-spec.md
```

Use `../../core/openspec-like.md` for artifact expectations. Keep the delta spec focused on this change:

```text
ADDED
MODIFIED
REMOVED
Affected specs
Questions needing confirmation
```

End the propose phase by asking the user to confirm implementation. Do not edit product code yet.

## Context

Assemble implementation context from the approved change. Include:

- task goal
- must-read specs
- must-read docs
- must-read code paths
- constraints and forbidden changes
- implementation steps
- verification commands
- open questions

Keep the bundle small. Do not paste entire large documents when links or file paths are enough.

## Apply

Only apply after explicit user confirmation.

1. Read the approved change package.
2. Implement tasks in `tasks.md`.
3. Update task checkboxes as work completes.
4. Record important decisions and verification results in `implementation-notes.md`.
5. Run relevant tests or explain why they could not be run.

## Archive

Archive only after implementation and verification.

1. Read `delta-spec.md`, `implementation-notes.md`, and verification results.
2. Update affected files under `interchange/specs/<domain>/`.
3. Update `interchange/context/index.md` or `source-index.md` if needed.
4. Move `interchange/changes/<change-id>/` to `interchange/archive/<yyyy-mm-dd>-<change-id>/`.
5. Leave a short summary of what changed, where it was verified, and which specs were updated.

If the delta is ambiguous or unverified, do not archive. Ask for confirmation or record the unresolved items in `review.md`.
