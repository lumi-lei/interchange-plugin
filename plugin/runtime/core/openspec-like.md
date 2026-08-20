# OpenSpec-like Workflow

Use this workflow to prepare reviewable project change artifacts before implementation.

For an end-to-end workflow with confirmation gates and repository files, use the `interchange-flow` skill. This reference defines the artifact shape shared by `interchange-flow` and `interchange-openspec-workflow`.

## Change Package

```text
proposal.md
context.md
design.md
tasks.md
delta-spec.md
review.md
```

## proposal.md

Include:

- background
- goals
- non-goals
- affected scope
- risks
- acceptance criteria

## context.md

Include:

- task goal
- must-read specs or docs
- must-read code paths
- business rules
- forbidden changes
- verification commands
- open questions

## design.md

Include:

- intended approach
- public interfaces or schemas
- data flow
- failure modes
- compatibility notes

## tasks.md

Use an executable checklist. Keep tasks small enough for an AI coding tool to complete and verify.

## delta-spec.md

Separate changes into:

- ADDED
- MODIFIED
- REMOVED
- affected specs
- questions needing human confirmation

## archive

Only archive after implementation and verification. Merge confirmed delta-spec changes into long-term specs, then move the change package to archive.

## Confirmation Gate

Before implementation, the user must confirm the generated proposal, design, tasks, and delta spec. If confirmation is missing, stop after the change package and ask for approval.

## Long-Term Specs

Use long-term specs for current, trusted project behavior. Use change packages for proposed or in-progress behavior. Do not treat raw imported Markdown as a long-term spec until it has been reviewed.
