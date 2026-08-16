# Interchange Workflow

## No-config Standalone Mode

1. Collect objective facts from the user or from inspected project materials.
2. Identify target roles or recipient types.
3. Read `roles.md` and `prompt-patterns.md`.
4. Generate one draft per role using the current AI tool's own model capability.
5. Mark missing information under `需要确认：`.
6. Show drafts to the user for review and editing.
7. Stop unless the user explicitly confirms sending.

This mode does not require a local server, database, DeepSeek key, OpenAI key, or webhook URL.

## Optional Webhook Mode

Use only after the user confirms the exact final message content and destination. Use `scripts/send_webhook.mjs` with a messages JSON file.

## Optional Connected Mode

Use when the user explicitly wants to reuse a running Interchange web app. The default API base is `http://127.0.0.1:4120/api`.

Connected Mode can provide:

- saved contacts and role preferences
- local file parsing
- DeepSeek-backed draft generation
- send and generation records

If the server is unavailable, continue in Standalone Mode.

## Source Priority

Prefer sources in this order:

1. inspected code and tests
2. reviewed specs or requirements
3. reviewed imported docs
4. raw imported docs
5. user-provided notes
6. assumptions, clearly labeled
