# Pi Agent

Telegram-controlled Pi SDK agent with repo-local Pi config.

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
data/pi-agent/
  audit.jsonl
  short-memory/
  memory/
```

`data/` is gitignored.

## Config

Create repo-local config:

```bash
mkdir -p config
cp config/pi-agent.example.json config/pi-agent.json
```

Secrets stay in `.env`:

```bash
TELEGRAM_BOT_TOKEN=replace-me
```

Edit:

```json
{
  "telegram": {
    "allowedUserIds": [123456789]
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
pnpm nx serve pi-agent
```

Hot reload:

```bash
pnpm pi-agent:dev
```

## Commands

- `/start`
- `/remember <text>`
- `/memory`
- `/forget`
- `/status`
- `/reload`
- `/cancel`
- Voice message
- `/server-status`
- `/server-services`
- `/server-logs <name-or-path>`
- `/server-restart <service>`
