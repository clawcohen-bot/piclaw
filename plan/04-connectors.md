# Phase 4: Connectors

Goal: make connectors thin adapters, not places where product features live.

## Core connector role

A connector should only:

- login/connect to platform
- normalize incoming messages
- send outgoing messages
- expose platform metadata
- manage lifecycle

A connector should not own:

- wiki logic
- calendar logic
- summaries
- custom team workflows
- AI prompts except basic handoff

## Connector API

Core connector shape:

```ts
interface PiclawConnector {
  name: string
  start(ctx): Promise<void>
  stop(ctx): Promise<void>
  send(message): Promise<void>
}
```

Incoming messages become normalized events:

- connector name
- chat id
- thread id
- sender
- text
- attachments
- timestamp
- raw platform payload

## Pi inspiration

Pi has one app shell around a reusable runtime.
Piclaw should let Telegram, Slack, WhatsApp, and CLI be app shells around the same message pipeline.

## Implementation steps

1. Normalize connector message types.
2. Route all incoming messages through `connector_message` event.
3. Keep platform-specific details under `raw`.
4. Move connector-specific feature logic into extensions.
5. Add connector registration later through extensions.

## Done when

- Telegram, Slack, WhatsApp, and CLI use the same internal message pipeline.
- A summary extension can listen to WhatsApp messages without editing WhatsApp connector code.
- A new connector can be added with minimal core changes, then later through extension registration.
