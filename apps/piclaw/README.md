# Piclaw

Telegram and Slack controlled Pi SDK agent with repo-local Pi config.

## Access philosophy

Piclaw trusts the owner by default.

- `rootPath` is the starting/default directory.
- It is not a sandbox or access boundary.
- In agent mode, the agent has write and shell tools.
- The agent can use absolute paths according to the permissions of the running process.
- Ask mode limits the exposed tools to read/search tools, but it is still not a strong sandbox.
- Extra restrictions should be opt-in.

## Pi data

This copy stores Pi data inside the repo:

```txt
data/piclaw/
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
data/runtime/
  audit.jsonl
  memory.md
  summary.md
  short-memory/
  modes/
  models/
  usage-warnings/
```

Wiki data lives here:

```txt
data/obsidian-vault/
```

Optional voice model files can live here:

```txt
data/voice/
```

`data/` is gitignored.

## Config

Create repo-local config:

```bash
cp config/piclaw.example.json config/piclaw.json
```

Secrets stay in `.env`.

Telegram secret:

```bash
TELEGRAM_BOT_TOKEN=replace-me
```

Slack secrets:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

`SLACK_SIGNING_SECRET` is optional in Socket Mode. If missing, Piclaw uses `socket-mode` internally.

Google Calendar secrets:

```bash
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:42813/oauth2callback
```

Minimal Telegram config:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": [123456789]
  },
  "rootPath": ".",
  "server": {
    "services": [],
    "logFiles": []
  }
}
```

Slack config:

```json
{
  "telegram": {
    "enabled": false,
    "allowedUserIds": []
  },
  "slack": {
    "enabled": true,
    "allowedUserIds": ["U012ABCDEF"]
  },
  "rootPath": ".",
  "server": {
    "services": [],
    "logFiles": []
  }
}
```

Optional config fields:

```json
{
  "devCli": {
    "enabled": false
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

Defaults:

- `telegram.enabled`: true
- `slack.enabled`: false
- `slack.allowedUserIds`: []
- `devCli.enabled`: false
- voice settings as shown above

`rootPath` may be relative or absolute. It only sets the bot's default working directory.

At least one connector must be enabled.

## Slack app requirements

- Socket Mode enabled
- app-level token scope: `connections:write`
- bot scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`
- bot events: `app_mention`, `message.im`
- reinstall the app after changing scopes or events

## Auth and models

Put Pi auth in:

```txt
data/piclaw/auth.json
```

Or use Telegram auth commands:

- `/login`
- `/logout`
- `/auth-status`
- `/auth-list`
- `/model`

Provider env vars in `.env` may also work if the Pi provider supports them.

## Run

Install dependencies:

```bash
pnpm install
```

Start with Nx reload loop:

```bash
pnpm nx serve piclaw
```

Shortcut:

```bash
pnpm piclaw
```

Hot reload/watch mode:

```bash
pnpm piclaw:dev
```

Run once without Nx reload loop:

```bash
pnpm piclaw:cli
```

Telegram `/reload` exits with code `75`. The Nx serve target restarts the bot when it sees that code.

## Slack usage

- DM the bot: `hi`
- Or mention it in a channel: `@your-bot hi`
- Invite the bot to channels where you want mentions to work.

Slack accepts tasks from allowed users. It does not implement the Telegram command set.

## Telegram commands

- `/start`
- `/remember <text>`
- `/memory`
- `/forget`
- `/new`
- `/usage`
- `/status`
- `/skills`
- `/mode`
- `/mode agent`
- `/mode ask`
- `/model`
- `/login`
- `/logout`
- `/auth-status`
- `/auth-list`
- `/cancel-auth`
- `/wiki`
- `/wiki-add <text>`
- `/wiki-search <query>`
- `/wiki-open <query>`
- `/calendar`
- `/calendar-connect`
- `/calendar-code <redirect-url-or-code>`
- `/calendar-disconnect`
- `/calendar-today`
- `/calendar-week`
- `/calendar-add title | start ISO | end ISO`
- `/cancel`
- `/reload`
- `/server-status`
- `/server-services`
- `/server-logs <name>`
- `/server-restart <service>`
- voice messages
