# Piclaw

Telegram and Slack controlled Pi coding agent with isolated repo-local config.

## What this is

Piclaw lets an allowed Telegram or Slack user send tasks to a Pi agent.

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

Choose the connector you want.

For Telegram, set your bot token in `.env`:

```env
TELEGRAM_BOT_TOKEN=replace-me
```

Then set your Telegram user id in `config/pi-agent.json`:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": [123456789]
  },
  "slack": {
    "enabled": false,
    "allowedUserIds": []
  }
}
```

For Slack, create a Slack app with:

- Socket Mode enabled
- app-level token scope: `connections:write`
- bot scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`
- bot events: `app_mention`, `message.im`

Then reinstall the app to the workspace.

Set Slack secrets in `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

Then set your Slack member id in `config/pi-agent.json`:

```json
{
  "telegram": {
    "enabled": false,
    "allowedUserIds": []
  },
  "slack": {
    "enabled": true,
    "allowedUserIds": ["U012ABCDEF"]
  }
}
```

To use both connectors, set both `enabled` values to `true`.

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

Bot details are in:

```txt
apps/pi-agent/README.md
```
