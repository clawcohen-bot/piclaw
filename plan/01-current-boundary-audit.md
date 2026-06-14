# Current Piclaw Boundary Audit

## Core

- `apps/piclaw/src/app/main.ts` - app bootstrap and connector startup.
- `apps/piclaw/src/core/config.ts` - config loading and path resolution.
- `apps/piclaw/src/core/storage.ts` - storage primitives.
- `apps/piclaw/src/core/events.ts` - typed lifecycle event bus.
- `apps/piclaw/src/core/extension-api.ts` - public extension API types.
- `apps/piclaw/src/core/extensions.ts` - trusted local extension loading.
- `apps/piclaw/src/core/registries.ts` - command, callback action, tool, cronjob, provider registries.
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
- `apps/piclaw/src/connectors/telegram/runtime-handlers.ts` - Telegram runtime bridge for command dispatch, callback dispatch, voice event translation, and agent task submission.

## Extension/package candidates

- `apps/piclaw/src/features/wiki/*` - implementation used by `packages/piclaw-wiki` extension commands/tools.
- `apps/piclaw/src/features/calendar/*` - implementation used by `packages/piclaw-calendar-google` extension commands/tools.
- `apps/piclaw/src/features/voice/*` - implementation used by `packages/piclaw-voice` extension tools.
- `apps/piclaw/src/server/*` -> server-admin extension/package.
- `apps/piclaw/src/features/packages/*` -> package discovery is core-adjacent; package UI can be an extension later.
- `apps/piclaw/src/features/skills/*` -> skill discovery is core; UI/status commands can be extensions later.

## Keep with caution

- `apps/piclaw/src/memory/*` - storage primitives are core-like, but automatic personal memory behavior should become extension-driven.
- `connectors/telegram/runtime-handlers.ts` should be reduced over time by moving Telegram-specific command presentation into focused extensions or connector-neutral response types.

## Migration status

- Core event bus, registries, extension API, package discovery, and runtime skeleton now exist.
- CLI and Slack route incoming messages through `connector_message` events.
- Agent runner exposes `before_agent_start`, `context_build`, and `agent_response` hooks.
- Tool registry exposes `tool_call` and `tool_result` hooks.
- Telegram connector is now thinned to startup/auth/launch and receives the Piclaw runtime from connector startup.
- Telegram slash commands now dispatch through the runtime command registry.
- Wiki, Google Calendar, and voice feature commands/tools are now package-owned extensions under `packages/`.
- Telegram voice handling delegates transcription through the `voice.transcribe-telegram-file` tool when the voice package is enabled.
- Telegram inline button callbacks now route through the runtime callback action registry instead of direct `bot.action(...)` handlers.
- Removed the old `features/telegram/telegram-feature-handlers.ts` compatibility layer.
- Google Calendar `/calendar-add` confirmation buttons are now owned by `packages/piclaw-calendar-google` callback actions.
- Telegram-specific auth/model/busy callback implementations and agent task submission still live in the Telegram runtime bridge until those features move into focused extensions.
- Remaining work: move server/memory/auth/model compatibility commands into focused extensions and keep reducing the Telegram runtime bridge.
