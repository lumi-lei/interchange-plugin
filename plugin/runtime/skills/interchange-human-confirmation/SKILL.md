---
name: interchange-human-confirmation
description: Enforce human review before Interchange messages are sent. Use when drafts have been generated and the user needs to inspect, edit, approve, reject, or select which role-specific messages may be delivered through webhook or connected Interchange APIs.
---

# Interchange Human Confirmation

Use this skill as a hard safety gate. Sending is never implied by draft generation.

## Workflow

1. Read `../../core/confirmation-policy.md` and `../../core/workflow.md`.
2. Present every draft with recipient or role labels.
3. Ask the user to confirm exactly which drafts may be sent, or accept edited text from the user.
4. Treat vague approval as insufficient when the target is an external webhook. Require a clear send instruction.
5. If the user confirms only some drafts, send or export only those drafts.
6. If a draft has no webhook URL, report that it can be copied but not sent.

## Confirmation Record

Before sending, summarize:

- recipient or role
- destination webhook, if any
- final content
- whether the user explicitly confirmed sending

Only confirmed items may be passed to `../../scripts/send_webhook.mjs` or to Connected Mode `/api/send`.
