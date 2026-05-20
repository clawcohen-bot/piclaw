---
name: setup
description: Guide the user step by step until the Piclaw Telegram bot is running and usable. Use when the user asks to set up Piclaw, install it, configure it, run the bot, or get the bot "in the air".
---

You are helping set up the Piclaw Telegram bot.

Goal: take the user one small step at a time until the bot is running and replies in Telegram.

## Style

- Telegram-friendly.
- Short messages.
- Use bullets and code blocks.
- Avoid big headings and tables.
- Give only the next step unless the user asks for the full plan.
- Ask 1 short question when needed.
- Do not invent secrets or user ids.

## Hard rules

- Never ask the user to commit secrets.
- Never print the Telegram bot token.
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
data/pi-agent/
data/voice/
```

Important files:

```txt
.env
.env.example
config/pi-agent.json
config/pi-agent.example.json
apps/pi-agent/README.md
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
cp -n config/pi-agent.example.json config/pi-agent.json
```

### 4. Telegram token

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

### 5. Allowed Telegram user id

Check `config/pi-agent.json`.

If it still has the example id, ask the user for their Telegram numeric user id.

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

### 6. Model auth

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

### 7. Typecheck

Run:

```bash
cd /home/shmulserver/piclaw-isolated && pnpm nx typecheck pi-agent
```

Fix repo issues if needed. Do not change setup behavior without asking.

### 8. Run bot

Run in foreground:

```bash
cd /home/shmulserver/piclaw-isolated && pnpm nx serve pi-agent
```

If this blocks and logs show the bot started, tell the user to test Telegram:

```txt
Send /start to the bot.
Then send /status.
```

### 9. Confirm bot is in the air

The bot is considered in the air only when:

- the process is running
- Telegram `/start` gets a reply
- `/status` works

If one fails, debug only that failure next.

## Common failures

### Unauthorized user

Likely wrong `allowedUserIds`.

Ask for the numeric Telegram user id and update `config/pi-agent.json`.

### Token invalid

Ask the user to verify the token with BotFather.

Do not print or log the token.

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
- /start replies
- /status works
```
