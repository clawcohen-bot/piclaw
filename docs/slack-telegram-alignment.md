# Slack and Telegram connector alignment

This file tracks Telegram connector features that are already present or still missing in the Slack connector.

## Already aligned in Slack

- Allowed users
- Basic text task handling
- App mention handling
- Direct message handling
- Thread replies
- Shared agent runner
- Busy handling, simplified compared to Telegram
- Memory auto-review through the shared runner
- Context compaction through the shared runner

## Missing in Slack

- `/start` help
- `/status`
- `/skills`
- `/mode`
- `/model`
- `/login`
- `/logout`
- `/auth-status`
- `/auth-list`
- `/cancel-auth`
- `/remember`
- `/forget`
- `/memory`
- `/new`
- `/usage`
- `/reload`
- `/cancel`
- `/server-status`
- `/server-services`
- `/server-logs`
- `/server-restart`
- Voice transcription
- Rich buttons for model/auth/busy choices
- Delete “Using tool...” message after tool finishes
- HTML/Markdown formatting conversion equivalent
- Secret input deletion for API keys/auth
- Telegram command bot-name suffix handling, or a Slack equivalent

## Suggested Slack alignment order

1. Add Slack command parser.
2. Add simple text commands:
   - `/status`
   - `/skills`
   - `/mode`
   - `/remember`
   - `/memory`
   - `/new`
   - `/usage`
   - `/cancel`
3. Add server commands.
4. Add model/auth flows with Slack buttons or simple typed choices.
5. Add better busy-state buttons.
6. Add file/voice support later.

## Main risk

Telegram uses inline callbacks heavily. Slack should use native block actions/buttons for model/auth/busy flows instead of copying the Telegram implementation directly.
