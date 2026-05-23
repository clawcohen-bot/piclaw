---
name: install-packages
description: Install or wire Pi packages/extensions for Piclaw. Use when the user asks to install Pi packages, add Pi extensions, enable package tools, add npm: packages to Piclaw, or wire tools like web_search/web_fetch into the Telegram bot.
---

You are helping install and wire Pi packages/extensions for the Piclaw Telegram bot.

Goal: make package tools available to Piclaw safely and verify they load.

## Style

- Telegram-friendly.
- Short messages.
- Use bullets and code blocks when useful.
- Avoid big headings and tables.
- Ask one short question when the package name or desired tools are unclear.
- Do not mention internal details unless useful.

## Hard rules

- Do not use global Pi files from `~/.pi`; this repo is isolated.
- Keep Pi config in this repo under `data/pi/`.
- Do not print secrets or auth files.
- Do not overwrite user config without reading it first.
- Prefer exact, minimal edits.
- Run typecheck after code changes.

## Default repo path

```txt
/home/shmulserver/piclaw-isolated
```

## Important files

```txt
package.json
pnpm-lock.yaml
data/pi/settings.json
data/pi/extensions/
apps/pi-agent/src/pi-task.ts
```

## Install flow

### 1. Clarify package names

If unclear, ask for the exact package names.

Examples:

```txt
Which Pi package should I install?
Example: pi-web-access or pi-smart-fetch
```

### 2. Check current state

Read:

```txt
package.json
data/pi/settings.json
apps/pi-agent/src/pi-task.ts
```

Check whether:

- package is already in `package.json`
- package is already in `data/pi/settings.json` under `packages`
- package exposes tools that must be added to the Piclaw allow-list in `pi-task.ts`

### 3. Install npm dependency

If missing from `package.json`, run from repo root:

```bash
pnpm add <package-name>
```

Do not install globally.

### 4. Add package to Piclaw Pi settings

Edit `data/pi/settings.json`.

Add package entries as:

```json
"packages": [
  "npm:<package-name>"
]
```

Keep existing settings unchanged.
Avoid duplicates.

For the common web packages:

```json
"packages": [
  "npm:pi-smart-fetch",
  "npm:pi-web-access"
]
```

### 5. Wire tool allow-list

Piclaw only exposes tools listed in `apps/pi-agent/src/pi-task.ts`.

If the package adds tools, add the tool names to the allow-list there.

Common web tools:

```txt
web_search
fetch_content
get_search_content
code_search
web_fetch
batch_web_fetch
```

Ask or inspect docs/source if tool names are unknown.

### 6. Custom local extensions

For local Pi extensions, place files here:

```txt
data/pi/extensions/
```

Use this only when the user asks for a custom extension or local tool.
Do not put local extensions in global Pi folders.

### 7. Verify

Run:

```bash
pnpm nx typecheck pi-agent
```

If dependencies changed, also confirm install completed successfully.

### 8. Tell user next step

After success, tell the user to reload/restart the bot:

```txt
Done.

Installed/wired:
- <package-name>

Run /reload to load it.
```

If the bot needs environment/API keys, mention only the key names, not values.

## Common cases

### pi-web-access

Usually needs:

- dependency: `pi-web-access`
- settings package: `npm:pi-web-access`
- tools: `web_search`, `fetch_content`, `get_search_content`, `code_search`

Optional config/API keys may live in repo-local Pi config if required. Do not use `~/.pi` unless the user explicitly asks.

### pi-smart-fetch

Usually needs:

- dependency: `pi-smart-fetch`
- settings package: `npm:pi-smart-fetch`
- tools: `web_fetch`, `batch_web_fetch`

## Final success message

Use a short message like:

```txt
Done ✅

Added package install skill:
- installs npm package locally
- adds `npm:<package>` to `data/pi/settings.json`
- wires package tools in `apps/pi-agent/src/pi-task.ts`
- runs typecheck
```
