# Piclaw Connectors

Connectors should be thin adapters.

A connector should:

- connect/login to the platform
- normalize incoming messages
- emit `connector_message`
- send outgoing messages
- manage lifecycle

A connector should not own product features like wiki, calendar, summaries, CRM, or custom team workflows.

Current shape:

```ts
const connector = {
  name: 'slack',
  start: async ({ runtime }) => {},
  stop: () => {},
}
```

Incoming normalized message shape includes connector, user id, conversation id, optional thread id, message id, text, timestamp, attachments, and raw platform payload.
