# Piclaw

Piclaw is a minimal claw-style coding agent built on top of the Pi SDK.

The goal is not to be secure, enterprise-ready, highly abstracted, or packed with integrations.

The goal is to be simple, hackable, and very customizable.

Piclaw gives you:

- Telegram control
- Slack control
- basic session context
- minimal memory
- repo-local configuration
- a simple way to talk to a Pi agent without choking the context

Piclaw intentionally does not try to solve everything.

It does not provide:

- strong security
- complex orchestration
- Docker-first deployment
- heavy abstractions
- enterprise integration layers

Those things are the responsibility of the user.

The philosophy is:

Clone the repo.
Add credentials.
Run the agent.
That’s it.

```bash
pnpm install
cp .env.example .env
cp config/piclaw.example.json config/piclaw.json
pnpm nx serve piclaw
```

Piclaw is the opposite of a secured orchestration framework.

It is a small, direct, customizable bridge between Telegram/Slack and a Pi-powered coding agent.

If you want something minimal that you can fully bend to your own workflow, Piclaw is for you.

## What this is

Piclaw lets an allowed Telegram or Slack user send tasks to a Pi agent.

This repo is isolated: it does not use global Pi files from `~/.pi`.

## Local data

Local files are kept in:

```txt
data/piclaw/     # Pi auth, settings, sessions
data/runtime/    # bot memory, audit log, queues
data/voice/      # optional voice model
```

`data/` is gitignored and should not be committed.

## Setup

```bash
pnpm install
cp .env.example .env
cp config/piclaw.example.json config/piclaw.json
```

Choose the connector you want.

For Telegram, set your bot token in `.env`:

```env
TELEGRAM_BOT_TOKEN=replace-me
```

Then set your Telegram user id in `config/piclaw.json`:

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

Then set your Slack member id in `config/piclaw.json`:

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
data/piclaw/auth.json
```

Or use provider env vars in `.env`, if your Pi provider supports them.

## Run

```bash
pnpm nx serve piclaw
```

The `/reload` command works here too. The bot exits with reload code `75`, and the Nx serve command starts it again.

For development:

```bash
pnpm piclaw:dev
```

## More docs

Bot details are in:

```txt
apps/piclaw/README.md
```
