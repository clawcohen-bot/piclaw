# Piclaw

Telegram and Slack controlled Pi SDK agent with repo-local Pi config.

## Access philosophy

Piclaw trusts the owner by default.

- `rootPath` is the starting/default directory.
- It is not a sandbox or access boundary.
- The agent can use absolute paths for full system access.
- Extra restrictions should be opt-in.

## Pi data

This copy does not use `~/.pi`.

Pi data lives inside this repo:

```txt
data/pi/
  auth.json
  settings.json
  models.json
  sessions/
  skills/
  prompts/
  themes/
  extensions/
```

Bot runtime data lives here:

```txt
data/piclaw/
  audit.jsonl
  short-memory/
  memory/
```

`data/` is gitignored.

## Config

Create repo-local config:

```bash
mkdir -p config
cp config/piclaw.example.json config/piclaw.json
```

Secrets stay in `.env`.

Telegram:

```bash
TELEGRAM_BOT_TOKEN=replace-me
```

Slack:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

Slack app requirements:

- Socket Mode enabled
- app-level token scope: `connections:write`
- bot scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`
- bot events: `app_mention`, `message.im`
- reinstall the app after changing scopes or events

Edit:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": [123456789]
  },
  "slack": {
    "enabled": false,
    "allowedUserIds": []
  },
  "rootPath": ".",
  "server": {
    "services": [],
    "logFiles": []
  },
  "voice": {
    "whisperCommand": "whisper-cli",
    "whisperModel": "data/voice/ggml-base.en.bin",
    "ffmpegCommand": "ffmpeg",
    "extraArgs": ["--no-prints"],
    "timeoutMs": 120000
  }
}
```

`rootPath` may be relative or absolute. It only sets the bot's default working directory.

## Auth

Put Pi auth in:

```txt
data/pi/auth.json
```

Or use provider env vars in `.env` if Pi supports them.

## Run

```bash
pnpm install
pnpm nx serve piclaw
```

Hot reload:

```bash
pnpm piclaw:dev
```

## Slack usage

- DM the bot: `hi`
- Or mention it in a channel: `@your-bot hi`
- Invite the bot to channels where you want mentions to work.

## Telegram commands

- `/start`
- `/remember <text>`
- `/memory`
- `/forget` (clear saved long memory)
- `/status`
- `/reload`
- `/cancel`
- Voice message
- `/server-status`
- `/server-services`
- `/server-logs <name-or-path>`
- `/server-restart <service>`
