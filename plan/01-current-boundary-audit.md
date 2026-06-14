# Current Piclaw Boundary Audit

## Core

- `apps/piclaw/src/app/main.ts` - app bootstrap and connector startup.
- `apps/piclaw/src/core/config.ts` - config loading and path resolution.
- `apps/piclaw/src/core/storage.ts` - storage primitives.
- `apps/piclaw/src/core/events.ts` - typed lifecycle event bus.
- `apps/piclaw/src/core/extension-api.ts` - public extension API types.
- `apps/piclaw/src/core/extensions.ts` - trusted local extension loading.
- `apps/piclaw/src/core/registries.ts` - command, tool, cronjob, provider registries.
- `apps/piclaw/src/core/runtime.ts` - runtime object passed to app/extension code.
- `apps/piclaw/src/agent/*` - agent runner, task state, model selection, mode, context usage.
- `apps/piclaw/src/messages/*` - generic formatting/text helpers.

## Connector

- `apps/piclaw/src/connectors/types.ts` - normalized connector API and message event shape.
- `apps/piclaw/src/connectors/cli/connector.ts` - CLI adapter.
- `apps/piclaw/src/connectors/slack/connector.ts` - Slack adapter.
- `apps/piclaw/src/connectors/telegram/auth.ts` - Telegram auth middleware.
- `apps/piclaw/src/connectors/telegram/telegram-context.ts` - Telegram metadata helpers.
- `apps/piclaw/src/connectors/telegram/telegram-text.ts` - Telegram text helpers.
- `apps/piclaw/src/connectors/telegram/connector.ts` - thin Telegram startup/auth/launch adapter.
- `apps/piclaw/src/features/telegram/telegram-feature-handlers.ts` - Telegram command/action compatibility layer that registers commands in the runtime command registry and keeps Telegram-specific UI callbacks.

## Extension/package candidates

- `apps/piclaw/src/features/wiki/*` -> `piclaw-wiki` package.
- `apps/piclaw/src/features/calendar/*` -> `piclaw-calendar-google` package.
- `apps/piclaw/src/features/voice/*` -> `piclaw-voice` package.
- `apps/piclaw/src/server/*` -> server-admin extension/package.
- `apps/piclaw/src/features/packages/*` -> package discovery is core-adjacent; package UI can be an extension later.
- `apps/piclaw/src/features/skills/*` -> skill discovery is core; UI/status commands can be extensions later.

## Keep with caution

- `apps/piclaw/src/memory/*` - storage primitives are core-like, but automatic personal memory behavior should become extension-driven.
- `features/telegram/telegram-feature-handlers.ts` should be reduced over time by moving commands to the command registry and feature packages.

## Migration status

- Core event bus, registries, extension API, package discovery, and runtime skeleton now exist.
- CLI and Slack route incoming messages through `connector_message` events.
- Agent runner exposes `before_agent_start`, `context_build`, and `agent_response` hooks.
- Tool registry exposes `tool_call` and `tool_result` hooks.
- Telegram connector is now thinned to startup/auth/launch and receives the Piclaw runtime from connector startup.
- Telegram slash commands now dispatch through the runtime command registry.
- Telegram-specific callback actions, voice handling, and agent task submission still live in the compatibility feature handler until those surfaces have connector-neutral abstractions.
- Remaining work: move feature command implementations from the compatibility handler into package-owned extensions one feature at a time.
