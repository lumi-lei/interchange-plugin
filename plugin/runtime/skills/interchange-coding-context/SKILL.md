---
name: interchange-coding-context
description: Convert objective project facts into actionable AI coding tool context. Use when preparing prompts for the user's AI coding tool or a teammate's AI coding tool, including implementation scope, constraints, files to inspect, tests, acceptance criteria, and questions to confirm.
---

# Interchange Coding Context

Use this skill when the recipient is an AI coding tool rather than a human stakeholder.

## Workflow

1. Read `../../core/roles.md`, `../../core/prompt-patterns.md`, and `../../core/confirmation-policy.md`.
2. Inspect relevant project files if the user asks for codebase-derived context.
3. Output an implementation-ready prompt with:
   - objective goal
   - confirmed facts
   - allowed scope
   - files or modules to inspect
   - forbidden changes
   - implementation steps
   - test and acceptance criteria
   - risks and open questions
4. Do not expand the requested scope beyond the source facts.
5. Distinguish the primary AI coding tool from a teammate AI coding tool:
   - primary AI: direct execution plan and acceptance criteria
   - teammate AI: collaboration boundaries, interface contracts, merge risks

## Output Shape

```md
# AI Coding Context

## Goal
## Confirmed Facts
## Scope
## Implementation Notes
## Tests
## Do Not Change
## Needs Confirmation
```
