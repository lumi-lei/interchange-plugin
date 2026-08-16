# Connected Interchange API

Connected Mode is optional. Use it only when a local Interchange server is running and the user asks to reuse it.

Default base URL: `http://127.0.0.1:4120/api`

## Endpoints

- `GET /health`: check service status and DeepSeek configuration.
- `GET /roles`: list roles and preferences.
- `PUT /roles/:key`: update a role custom preference.
- `GET /contacts`: list recipients.
- `POST /contacts`: create a recipient.
- `PUT /contacts/:id`: update a recipient.
- `DELETE /contacts/:id`: delete a recipient.
- `POST /inputs/parse`: parse text or uploaded files into editable text.
- `POST /generate`: generate drafts from `sourceText`, `inputRecordId`, and `contactIds`.
- `POST /send`: send confirmed messages.
- `GET /records`: list recent generation and send records.

## Safety Boundary

The local server keeps uploaded files local by default. `/api/generate` receives editable `sourceText`, not original attachments. External vision and file providers are disabled by default in the current app.

## Fallback

If the server is down or returns an error, use Standalone Mode. Do not require users to start the server for ordinary drafting.
