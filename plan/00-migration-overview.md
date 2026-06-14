# Phase 0: Migration Overview

Goal: reshape Piclaw into a small, flexible, extensible messaging/workflow agent inspired by pi.

## Vision

Piclaw core should be minimal:

- run the agent loop
- connect to messaging platforms
- choose and use models
- manage provider login/logout
- load skills
- run tools
- run cronjobs
- load extensions/packages
- expose clear events and APIs

Everything product-specific should live outside core:

- wiki
- calendar
- CRM
- notes
- summaries
- personal/team automations
- custom workflows

## Pi lessons used

From `/home/shmulserver/pi`:

- `packages/agent` is the small reusable runtime.
- `packages/ai` is the provider/model abstraction.
- `packages/coding-agent` is the app shell around the runtime.
- Extensions are normal TypeScript modules.
- Extensions register tools, commands, providers, shortcuts, and event handlers.
- Skills are discovered by metadata and loaded only when needed.
- Packages bundle extensions, skills, prompts, and themes.
- Core emits lifecycle events instead of hardcoding every feature.
- Config supports global and project-local resources.

## Target Piclaw shape

Piclaw should become:

- `piclaw-core`: agent runtime, events, config, extension loader
- `piclaw-ai`: providers, models, auth, login/logout
- `piclaw-app`: Telegram/Slack/WhatsApp/CLI host
- `piclaw-extensions`: external features as packages

## Migration rule

For every feature ask:

- Is this needed by almost every Piclaw install?
  - yes: core candidate
  - no: extension/package
- Does it depend on a specific service or workflow?
  - yes: extension/package
- Can it be implemented through events/tools/commands/config?
  - yes: keep it external

## Order

1. Audit current code.
2. Define the core boundary.
3. Add a stable event bus.
4. Add extension API.
5. Move tools/skills/cronjobs to resource discovery.
6. Make providers/models/auth pluggable.
7. Make connectors thin adapters.
8. Move wiki/calendar/voice out of core.
9. Document and test the extension-first architecture.
