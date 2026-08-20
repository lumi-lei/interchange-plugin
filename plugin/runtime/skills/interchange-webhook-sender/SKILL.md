---
name: interchange-webhook-sender
description: Send only user-confirmed Interchange messages to generic webhook URLs. Use when final role-specific drafts have been reviewed, selected, and explicitly approved for delivery; never use for unreviewed generated drafts.
---

# Interchange Webhook Sender

Use this skill only after the human confirmation gate.

## Inputs

- Final content for each message.
- Recipient name or role.
- Webhook URL for each destination.
- Explicit user confirmation that these exact messages may be sent.

## Workflow

1. Read `../../core/confirmation-policy.md`.
2. Verify each message has `confirmed: true` in the input JSON or a clear equivalent confirmation in the conversation.
3. Use `../../scripts/send_webhook.mjs --messages <file.json>` for standalone sending.
4. Report every delivery result, including HTTP status or error message.
5. Do not retry failed sends unless the user asks.

## Message JSON Shape

```json
{
  "messages": [
    {
      "recipient": "QA",
      "role": "qa",
      "webhookUrl": "https://example.com/hook",
      "content": "confirmed message",
      "confirmed": true
    }
  ]
}
```
