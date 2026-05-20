# Piclaw

Telegram-controlled Pi coding agent with isolated repo-local config.

## What this is

Piclaw lets an allowed Telegram user send tasks to a Pi agent.

This repo is isolated: it does not use global Pi files from `~/.pi`.

## Local runtime data

Runtime files are kept in:

```txt
data/pi/                    # Pi auth, settings, sessions
data/telegram-pi-agent/    # bot memory, audit log, queues
data/voice/                 # optional voice model
```

`data/` is gitignored and should not be committed.

## Setup

```bash
pnpm install
cp .env.example .env
cp config/telegram-pi-agent.example.json config/telegram-pi-agent.json
```

Set your Telegram bot token in `.env`:

```env
TELEGRAM_BOT_TOKEN=replace-me
```

Edit `config/telegram-pi-agent.json` and set your Telegram user id:

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
pnpm nx serve telegram-pi-agent
```

For development:

```bash
pnpm telegram-pi-agent:dev
```

## Run with systemd

Create a service file:

```bash
sudo nano /etc/systemd/system/piclaw.service
```

Paste this:

```ini
[Unit]
Description=Piclaw Telegram Pi Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=shmulserver
WorkingDirectory=/home/shmulserver/piclaw-isolated
Environment=NODE_ENV=production
Environment=PATH=/home/shmulserver/.nvm/versions/node/v24.14.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/shmulserver/.nvm/versions/node/v24.14.0/bin/pnpm nx serve telegram-pi-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Reload systemd and start the bot:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now piclaw
```

Check status and logs:

```bash
sudo systemctl status piclaw
sudo journalctl -u piclaw -f
```

Restart after code or config changes:

```bash
sudo systemctl restart piclaw
```

## More docs

Telegram bot details are in:

```txt
apps/telegram-pi-agent/README.md
```
