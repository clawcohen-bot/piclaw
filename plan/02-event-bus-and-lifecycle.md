# Phase 2: Event Bus and Lifecycle

Goal: make Piclaw extensible through events instead of hardcoded feature calls.

## Pi inspiration

Pi extensions subscribe to events like:

- `session_start`
- `session_shutdown`
- `input`
- `before_agent_start`
- `context`
- `tool_call`
- `tool_result`
- `message_start`
- `message_end`
- `model_select`

This lets extensions observe, block, modify, or add behavior.

## Piclaw lifecycle events

Start with a small event set:

- `app_start`
- `app_shutdown`
- `connector_start`
- `connector_message`
- `connector_send`
- `before_agent_start`
- `context_build`
- `agent_response`
- `tool_call`
- `tool_result`
- `cron_tick`
- `model_select`
- `provider_login`
- `provider_logout`

## Design rules

- Events must be typed.
- Event handlers can be async.
- Some events are observe-only.
- Some events can transform data.
- Some events can block an action.
- Extension failure should not crash the whole bot unless configured.

## Implementation steps

1. Add a small typed event bus in core.
2. Route important app actions through events.
3. Add tests for handler order, errors, blocking, and transforms.
4. Keep the first version minimal.

## Done when

- A feature can observe incoming messages without changing connector code.
- A feature can block or transform a tool call.
- A feature can add context before the model call.
