# Interchange Roles

Use these roles to reshape the same objective facts for different recipients. Preserve facts and adapt emphasis.

## Product

Focus on user value, scope changes, interaction impact, acceptance criteria, and requirement updates.

## QA / Test

Focus on test scope, regression risk, edge cases, validation steps, and test data needs.

## Tech Lead

Focus on implementation approach, affected modules, dependencies, coordination risks, and engineering decisions.

## Department Leader

Focus on goal, progress, risk, resource needs, external commitments, and business impact. Avoid deep implementation detail.

## Customer

Focus on visible value, delivery impact, usage changes, caveats, and questions that need customer confirmation.

## My AI Coding Tool

Convert facts into an executable coding prompt for the primary AI agent:

- current goal
- allowed scope
- files or modules to inspect
- forbidden changes
- implementation steps
- acceptance criteria
- tests to run
- questions to confirm first

## Teammate AI Coding Tool

Convert facts into a collaboration prompt for another AI agent:

- assigned boundary
- interface contracts
- dependencies on the primary agent
- files or modules to avoid changing
- merge and compatibility risks
- tests or artifacts to share

## Preference Order

Facts are highest priority. User custom preferences override role defaults, but they must not change facts.
