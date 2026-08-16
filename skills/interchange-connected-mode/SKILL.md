---
name: interchange-connected-mode
description: Optionally connect to a running local Interchange server for contacts, roles, file parsing, DeepSeek-backed generation, send records, and webhook delivery. Use only when the user explicitly wants to reuse the local Interchange app; otherwise use no-config standalone skills.
---

# Interchange Connected Mode

Connected Mode is an optional enhancement, not a dependency.

## Requirements

- Default API base: `http://127.0.0.1:4120/api`.
- The local Interchange server may require `DEEPSEEK_API_KEY` for `/api/generate`.
- Sending still requires explicit user confirmation.

## Workflow

1. Read `../../core/workflow.md`, `../../core/confirmation-policy.md`, and `../../core/connected-api.md`.
2. Check service status with `../../scripts/interchange_api.mjs health`.
3. If the server is unavailable, clearly say Connected Mode is unavailable and continue with Standalone Mode.
4. If available, use the server only for the specific capability the user requested:
   - contacts and roles
   - local file parsing
   - DeepSeek-backed draft generation
   - recorded webhook delivery
5. Never send through `/api/send` until the user has reviewed and confirmed the exact final content.

## Fallback

If any connected API call fails, keep the user's source facts and continue with the no-config workflow when possible.
