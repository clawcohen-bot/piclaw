# Phase 3: Extension API

Goal: allow external TypeScript modules to extend Piclaw without changing core code.

## Pi inspiration

Pi extensions export a default function:

```ts
export default function (pi) {
  pi.on("session_start", async (event, ctx) => {})
  pi.registerTool({...})
  pi.registerCommand("hello", {...})
  pi.registerProvider("local", {...})
}
```

Piclaw should use the same simple mental model.

## First Piclaw extension API

```ts
export default function (piclaw: PiclawExtensionAPI) {
  piclaw.on("connector_message", async (event, ctx) => {})
  piclaw.registerTool({...})
  piclaw.registerCommand("name", {...})
  piclaw.registerCronjob({...})
  piclaw.registerConnector({...})
  piclaw.registerProvider("name", {...})
}
```

## Extension locations

Support:

- global: `~/.piclaw/extensions`
- project/local: `.piclaw/extensions`
- config paths: `extensions: []`
- package resources later

## Context available to extensions

- config
- storage
- logger
- connector send API
- current user/chat/thread metadata
- model/provider APIs
- tool registry
- cronjob registry

## Security rule

Extensions run as code with full process permissions.

So Piclaw must document:

- only install trusted extensions
- project-local extensions require trust/approval later
- no fake sandbox promise

## Implementation steps

1. Define `PiclawExtensionAPI` types.
2. Load local TypeScript extensions with a simple loader.
3. Add `registerTool` and `registerCommand` first.
4. Add `piclaw.on()` event registration.
5. Add tests with fixture extensions.

## Done when

- A new command can be added from `.piclaw/extensions/test.ts`.
- A new tool can be added from an extension.
- No core code changes are needed for the extension.
