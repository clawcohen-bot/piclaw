# Piclaw - minimal personal agent

Piclaw is a small personal AI agent built on top of the Pi SDK.

It lets an allowed Telegram or Slack user send tasks to a Pi-powered coding agent.

This repo is isolated: Pi data is stored under this project in `data/piclaw/`, not in global `~/.pi` files.

## Main idea

Piclaw is meant to be:

- simple
- hackable
- repo-local
- easy to customize
- easy to run from Telegram or Slack

Piclaw is not meant to be:

- a secure sandbox
- an enterprise orchestration platform
- a Docker-first deployment system
- a heavy abstraction layer

The basic flow is:

1. Install dependencies.
2. Create local config and secrets files.
3. Add Pi/LLM auth.
4. Choose Telegram, Slack, or both.
5. Run the bot.

## Features

- Telegram connector
- Slack connector through Socket Mode
- optional local dev CLI connector
- allowed-user access control for Telegram and Slack
- per-chat short context
- shared long memory
- session summary compaction
- repo-local Pi auth, settings, models, sessions, skills, prompts, themes, and extensions
- repo-local runtime data
- Telegram voice-message transcription through Whisper
- Telegram wiki commands for the repo-local Obsidian vault
- Telegram Google Calendar commands
- Telegram server status, logs, and restart commands for configured allowlists
- Telegram `/reload` command for development

## Quick start

```bash
pnpm install
cp .env.example .env
cp config/piclaw.example.json config/piclaw.json
```

Then edit `.env` and `config/piclaw.json` before running the bot.

Start the bot:

```bash
pnpm nx serve piclaw
```

## Project data

Local data is stored here:

```txt
data/piclaw/            # Pi auth, settings, models, sessions, skills, prompts, themes, extensions
data/runtime/           # bot memory, session summaries, modes, audit log, usage warnings
data/obsidian-vault/    # repo-local Obsidian wiki vault
data/voice/             # optional Whisper model files
```

`data/` is gitignored and should not be committed.

## Configuration files

Create the local files:

```bash
cp .env.example .env
cp config/piclaw.example.json config/piclaw.json
```

Use `.env` for secrets.

Use `config/piclaw.json` for enabled connectors, allowed users, root path, server allowlists, and voice settings.

The example config enables Telegram by default. Slack and dev CLI default to disabled unless you add/enable them.

## Telegram setup

1. Create a Telegram bot with BotFather.
2. Put the bot token in `.env`:

```env
TELEGRAM_BOT_TOKEN=replace-me
```

3. Enable Telegram and add your Telegram user id in `config/piclaw.json`:

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

`telegram.enabled` is optional. If it is missing, Telegram is enabled.

## Slack setup

1. Create a Slack app.
2. Enable Socket Mode.
3. Add app-level token scope:

```txt
connections:write
```

4. Add bot scopes:

```txt
app_mentions:read
chat:write
im:history
im:read
```

5. Add bot events:

```txt
app_mention
message.im
```

6. Reinstall the app to the workspace.

7. Put Slack secrets in `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

`SLACK_SIGNING_SECRET` is optional in Socket Mode. If missing, Piclaw uses `socket-mode` internally.

8. Enable Slack and add your Slack member id in `config/piclaw.json`:

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

## Using both Telegram and Slack

Enable both connectors in `config/piclaw.json`:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": [123456789]
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

Both connectors can run at the same time.

## Dev CLI

There is also a local CLI connector for development:

```json
{
  "devCli": {
    "enabled": true
  }
}
```

At least one connector must be enabled.

## Pi auth and models

Piclaw stores Pi auth here:

```txt
data/piclaw/auth.json
```

Model registry data is stored here:

```txt
data/piclaw/models.json
```

From Telegram you can use `/login`, `/logout`, `/auth-status`, `/auth-list`, and `/model` to manage auth and model selection.

Provider environment variables in `.env` may also work, depending on the Pi provider.

## Run commands

Start with Nx:

```bash
pnpm nx serve piclaw
```

Shortcut:

```bash
pnpm piclaw
```

Development watch mode:

```bash
pnpm piclaw:dev
```

Run once without Nx reload loop:

```bash
pnpm piclaw:cli
```

The Telegram `/reload` command exits the bot with code `75`. The Nx serve command detects that code and starts it again.

## Telegram commands

Telegram supports:

- `/start`
- `/status`
- `/remember <text>`
- `/memory`
- `/forget`
- `/new`
- `/usage`
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

## Slack usage

Slack does not implement the Telegram command set.

Use Slack by sending tasks:

- DM the bot directly.
- Or mention it in a channel.
- Invite the bot to channels where mentions should work.

Only Slack users listed in `slack.allowedUserIds` are accepted.

## Security note

Piclaw trusts the owner by default.

`rootPath` is only the default working directory. It is not a sandbox.

In agent mode, the agent has write and shell tools. It may use absolute paths and can access the system according to the permissions of the running process.

In ask mode, the agent gets read/search tools but this is still not a strong security sandbox.

Add your own restrictions if you need stronger security.

## More docs

More detailed app documentation is here:

```txt
apps/piclaw/README.md
```
