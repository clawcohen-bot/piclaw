# Piclaw

Telegram-controlled Pi coding agent with isolated repo-local config.

## What this is

Piclaw lets an allowed Telegram user send tasks to a Pi agent.

This repo is isolated: it does not use global Pi files from `~/.pi`.

## Local runtime data

Runtime files are kept in:

```txt
data/pi/                    # Pi auth, settings, sessions
data/pi-agent/    # bot memory, audit log, queues
data/voice/                 # optional voice model
```

`data/` is gitignored and should not be committed.

## Setup

```bash
pnpm install
cp .env.example .env
cp config/pi-agent.example.json config/pi-agent.json
```

Set your Telegram bot token in `.env`:

```env
TELEGRAM_BOT_TOKEN=replace-me
```

Edit `config/pi-agent.json` and set your Telegram user id:

```json
{
  "telegram": {
    "allowedUserIds": [123456789]
  }
}
```

## Pi auth

Put Pi auth here:

```txt
data/pi/auth.json
```

Or use provider env vars in `.env`, if your Pi provider supports them.

## Run

```bash
pnpm nx serve pi-agent
```

The `/reload` command works here too. The bot exits with reload code `75`, and the Nx serve command starts it again.

For development:

```bash
pnpm pi-agent:dev
```

## More docs

Telegram bot details are in:

```txt
apps/pi-agent/README.md
```
