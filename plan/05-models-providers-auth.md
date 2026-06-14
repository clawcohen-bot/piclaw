# Phase 5: Models, Providers, and Auth

Goal: make model choice and provider auth modular.

## Pi inspiration

Pi has `packages/ai` with:

- provider registry
- model registry
- custom models config
- OAuth providers
- dynamic API key resolution
- provider overrides
- extension-based provider registration

Piclaw already depends on Pi packages, so first prefer integration over rebuilding.

## Piclaw requirements

Core should support:

- list models
- choose model globally
- choose model per chat/user/connector later
- register custom provider
- override provider base URL/headers
- login/logout providers
- store auth safely
- use env vars or commands for API keys

## Extension API

Extensions should be able to:

- `registerProvider(name, config)`
- `unregisterProvider(name)`
- add dynamic model lists
- provide login/logout handlers

## Config direction

Support a Piclaw model config inspired by Pi `models.json`:

```json
{
  "models": {
    "default": "openai/gpt-4.1-mini"
  },
  "providers": {}
}
```

## Implementation steps

1. Audit current `agent/model.ts`.
2. Decide what to delegate to `@earendil-works/pi-ai`.
3. Add provider/model registry wrapper.
4. Add login/logout command shape.
5. Add tests for custom provider registration.

## Done when

- User can choose a model from config.
- Extension can register a provider.
- Provider auth is separated from connectors.
