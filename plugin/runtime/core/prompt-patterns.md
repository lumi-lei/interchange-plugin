# Prompt Patterns

Use these patterns inside the current AI coding tool. Do not call a separate model API.

## Role Message Draft

```text
Rewrite the objective facts below for <role>.

Rules:
- Preserve facts.
- Do not invent owners, dates, release commitments, or conclusions.
- Emphasize what this role needs to know or do next.
- If information is missing, add "需要确认：" with concise questions.
- Output directly usable Chinese content.

Objective facts:
<facts>
```

## Multi-role Draft

```text
Create one editable Chinese draft for each target role:
<roles>

Use the Interchange role rules:
- Product: scope, user value, acceptance.
- QA: risk, test scope, regression, validation.
- Tech lead: modules, dependencies, engineering decisions.
- Leader: status, risk, resources, business impact.
- Customer: visible value, usage impact, confirmations.
- AI coding tool: executable context and acceptance criteria.

Facts:
<facts>
```

## AI Coding Tool Prompt

```text
Convert these facts into an implementation prompt for an AI coding tool.

Output:
# AI Coding Context
## Goal
## Confirmed Facts
## Scope
## Implementation Notes
## Tests
## Do Not Change
## Needs Confirmation

Facts:
<facts>
```

## Review Gate Prompt

```text
Before sending, show each final message with recipient, destination, and content.
Ask for explicit confirmation. Do not send until the user confirms the exact messages.
```
