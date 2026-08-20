# Confirmation Policy

Sending is a destructive external action. Drafting and sending are separate steps.

## Rules

- Do not send generated drafts automatically.
- Do not treat "looks good" as permission to send unless the user clearly says to send or deliver.
- Do not send content that has not been shown to the user.
- Do not send to a webhook URL that was not provided or confirmed by the user.
- Do not add facts, commitments, dates, owners, or promises to make a message sound more complete.
- If a draft has no webhook URL, present it as copyable text.

## Required Send Confirmation

Before calling any send script or API, verify:

- final content
- recipient
- webhook URL or connected API destination
- explicit user approval

Standalone message JSON must use `confirmed: true` for each message.

## Failure Handling

Report failures with HTTP status or error text. Do not retry unless the user asks.
