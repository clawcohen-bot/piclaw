---
name: setup
description: Guide the user step by step until the Piclaw bot is running and usable through Telegram, Slack, or both. Use when the user asks to set up Piclaw, install it, configure it, run the bot, or get the bot "in the air".
---

You are helping set up the Piclaw bot.

Goal: take the user one small step at a time until the bot is running and replies through the chosen connector: Telegram, Slack, or both.

## Style

- Chat-friendly.
- Short messages.
- Use bullets and code blocks.
- Avoid big headings and tables.
- Give only the next step unless the user asks for the full plan.
- Ask 1 short question when needed.
- Do not invent secrets or user ids.

## Hard rules

- Never ask the user to commit secrets.
- Never print Telegram tokens, Slack tokens, Slack signing secrets, OpenAI keys, or auth file contents.
- Do not use systemd steps.
- Do not use global Pi files from `~/.pi`; this repo is isolated.
- Keep all paths inside the repo unless the user explicitly asks otherwise.

## Repo assumptions

Default repo path:

```txt
/home/shmulserver/piclaw-isolated
```

Piclaw stores local runtime data here:

```txt
data/pi/
data/piclaw/
data/voice/
```

Important files:

```txt
.env
.env.example
config/piclaw.json
config/piclaw.example.json
apps/piclaw/README.md
README.md
```

## Setup flow

Work through these checks in order.

### 1. Check repo exists

Run:

```bash
cd /home/shmulserver/piclaw-isolated && pwd && ls
```

If missing, stop and ask where the repo is.

### 2. Install deps

Run:

```bash
cd /home/shmulserver/piclaw-isolated && pnpm install
```

If `pnpm` is missing, ask the user before installing anything global.

### 3. Create config files

If missing, create from examples:

```bash
cd /home/shmulserver/piclaw-isolated
cp -n .env.example .env
cp -n config/piclaw.example.json config/piclaw.json
```

### 4. Choose connector

Ask which connector they want:

```txt
Which connector do you want?
- Telegram
- Slack
- both
```

Then update `config/piclaw.json`:

- Telegram only:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": []
  },
  "slack": {
    "enabled": false,
    "allowedUserIds": []
  }
}
```

- Slack only:

```json
{
  "telegram": {
    "enabled": false,
    "allowedUserIds": []
  },
  "slack": {
    "enabled": true,
    "allowedUserIds": []
  }
}
```

- Both:

```json
{
  "telegram": {
    "enabled": true,
    "allowedUserIds": []
  },
  "slack": {
    "enabled": true,
    "allowedUserIds": []
  }
}
```

Keep the rest of the file unchanged.

### 5. Telegram setup

Do this only if Telegram is enabled.

#### Telegram token

Check only whether `.env` contains a non-empty token.

Do not print the token.

If missing, give the user two options:

```txt
Telegram token is missing.

Choose one:
- add it yourself in `.env`
- send me the token and I will add it for you
```

If the user wants to add it themselves, tell them:

```txt
Open .env and set:

TELEGRAM_BOT_TOKEN=your_bot_token
```

If the user sends the token:

- update only `TELEGRAM_BOT_TOKEN` in `.env`
- never echo the token back
- never include the token in logs, commits, or replies
- reply only that the token was saved

Tell them to get the token from BotFather if needed.

#### Allowed Telegram user id

Check `config/piclaw.json`.

If `telegram.allowedUserIds` is empty or still has the example id, ask the user for their Telegram numeric user id.

Useful message:

```txt
Send /start to @userinfobot in Telegram.
Then send me the numeric id.
```

Then update:

```json
{
  "telegram": {
    "allowedUserIds": [123456789]
  }
}
```

Keep the rest of the file unchanged.

### 6. Slack setup

Do this only if Slack is enabled.

#### Slack app config

Tell the user to create or open the Slack app:

```txt
Go to https://api.slack.com/apps
Open your app, or create a new one.
```

Required bot token scopes:

```txt
app_mentions:read
chat:write
im:history
im:read
```

Required bot events:

```txt
app_mention
message.im
```

Socket Mode:

```txt
Enable Socket Mode.
Create an app-level token with:
connections:write
```

Then tell them to reinstall the app to the workspace.

#### Slack secrets

Check only whether `.env` has non-empty values for:

```txt
SLACK_BOT_TOKEN
SLACK_APP_TOKEN
SLACK_SIGNING_SECRET
```

Do not print the values.

If missing, give the user two options:

```txt
Slack secrets are missing.

Choose one:
- add them yourself in `.env`
- send them here and I will save them
```

If the user wants to add them themselves, tell them:

```txt
Open .env and set:

SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

If the user sends secrets:

- update only those keys in `.env`
- never echo the secrets back
- never include secrets in logs, commits, or replies
- reply only that the Slack secrets were saved

#### Allowed Slack user id

Check `config/piclaw.json`.

If `slack.allowedUserIds` is empty, ask for the Slack member id.

Useful message:

```txt
Open your Slack profile.
Click More.
Copy member ID.
Then send me the id, like U012ABCDEF.
```

Then update:

```json
{
  "slack": {
    "allowedUserIds": ["U012ABCDEF"]
  }
}
```

Keep the rest of the file unchanged.

### 7. Model auth

Piclaw must have model auth before the bot can answer.

Preferred auth file:

```txt
data/pi/auth.json
```

Check only whether it exists and is non-empty.
Do not print its contents.

If missing, ask the user to choose one option:

```txt
Model auth is missing.

Choose one:
- OpenAI ChatGPT Plus/Pro subscription login
- OpenAI API key
- copy existing Pi auth into data/pi/auth.json
- configure it yourself
```

#### OpenAI ChatGPT Plus/Pro subscription

Do not ask for the user's OpenAI password.
Do not ask for browser cookies or tokens.

Guide them through isolated Pi login:

```bash
cd /home/shmulserver/piclaw-isolated
mkdir -p data/pi
PI_CODING_AGENT_DIR="$PWD/data/pi" pnpm exec pi
```

Then tell them to run inside Pi:

```txt
/login
```

Then:

- choose `ChatGPT Plus/Pro (Codex)`
- complete browser login themselves
- auth should be saved to `data/pi/auth.json`

After login, check without printing secrets:

```bash
cd /home/shmulserver/piclaw-isolated
test -s data/pi/auth.json && echo "Model auth exists"
```

#### OpenAI API key

If the user wants API key auth, give two options:

```txt
OpenAI API key auth.

Choose one:
- add OPENAI_API_KEY yourself in .env
- send me the key and I will save it for you
```

If the user sends the API key:

- update only `OPENAI_API_KEY` in `.env`
- never echo the key back
- never include the key in logs, commits, or replies
- reply only that the key was saved

#### Existing Pi auth

If the user wants to copy existing auth, tell them to place it at:

```txt
data/pi/auth.json
```

Do not use `~/.pi` directly.
Do not copy from `~/.pi` unless the user explicitly asks.

### 8. Typecheck

Run:

```bash
cd /home/shmulserver/piclaw-isolated && pnpm nx typecheck piclaw
```

Fix repo issues if needed. Do not change setup behavior without asking.

### 9. Run bot

Run in foreground:

```bash
cd /home/shmulserver/piclaw-isolated && pnpm nx serve piclaw
```

If this blocks, tell the user to test the enabled connector.

Telegram test:

```txt
Send /start to the bot.
Then send /status.
```

Slack test:

```txt
DM the Slack bot: hi
Or mention it in a channel: @your-bot hi
```

### 10. Confirm bot is in the air

The bot is considered in the air only when:

- the process is running
- each enabled connector replies
- Telegram `/status` works if Telegram is enabled
- Slack DM or channel mention works if Slack is enabled

If one fails, debug only that failure next.

## Common failures

### Telegram unauthorized user

Likely wrong `telegram.allowedUserIds`.

Ask for the numeric Telegram user id and update `config/piclaw.json`.

### Telegram token invalid

Ask the user to verify the token with BotFather.

Do not print or log the token.

### Slack does not reply in channel

Check:

- bot is invited to the channel
- `Event Subscriptions` is on
- bot event `app_mention` exists
- app was reinstalled to workspace
- user id is in `slack.allowedUserIds`

### Slack does not reply in DM

Check:

- `Event Subscriptions` is on
- bot event `message.im` exists
- scopes include `im:history` and `im:read`
- app was reinstalled to workspace
- user id is in `slack.allowedUserIds`

### Slack token invalid

Ask the user to verify Slack tokens in the Slack app page.

Do not print or log the tokens.

### Model auth error

Ask which auth method they want:

- OpenAI ChatGPT Plus/Pro subscription login
- OpenAI API key in `.env`
- copy existing auth to `data/pi/auth.json`

Never ask for an OpenAI password.
Never print keys or auth files.

### Port or process issue

This bot runs from the foreground Nx command. Do not suggest systemd.

## Final success message

When done, reply:

```txt
Piclaw is in the air ✅

Checked:
- bot process is running
- enabled connector replies
- /status works if Telegram is enabled
```
