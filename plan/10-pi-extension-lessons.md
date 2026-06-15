# Pi extension lessons for Piclaw

Source reviewed:

- `@earendil-works/pi-coding-agent/docs/extensions.md`
- `@earendil-works/pi-coding-agent/docs/packages.md`
- `dist/core/extensions/loader.js`
- `dist/core/extensions/runner.js`
- examples: `hello.ts`, `dynamic-tools.ts`, `with-deps/`

## The main Pi pattern

A feature is a normal TypeScript module that exports one default factory:

```ts
export default function (pi: ExtensionAPI) {
  pi.on("session_start", handler)
  pi.registerTool(tool)
  pi.registerCommand("name", command)
}
```

The extension imports only public SDK/types from `@earendil-works/pi-coding-agent`, never app internals.

For Piclaw, external features should import only a public package like `@piclaw/sdk` or `@piclaw/core`, not `apps/piclaw/src/...`.

## Loader lessons

Pi loads extension entry points from:

- project-local `.pi/extensions/*.ts`
- project-local `.pi/extensions/*/index.ts`
- global `~/.pi/agent/extensions/*.ts`
- configured paths from settings
- package manifests under `package.json -> pi.extensions`

It uses `jiti` so TypeScript extensions run without a build step.

Piclaw should copy this mental model:

- `.piclaw/extensions/*.ts`
- `.piclaw/extensions/*/index.ts`
- `~/.piclaw/extensions/*.ts`
- config `extensions: []`
- package manifest later, e.g. `piclaw.extensions`

## API lessons

Pi separates registration from core implementation.

Extension API methods only register capabilities:

- `on(event, handler)`
- `registerTool(...)`
- `registerCommand(...)`
- `registerProvider(...)`
- `registerShortcut(...)`
- `registerFlag(...)`

Core owns the runtime and calls registered handlers/tools later.

For Piclaw:

- packages register calendar/cron/wiki/slack/telegram features
- core only knows the extension API contracts
- no package may reach into app internals

## Runtime lessons

Pi creates a runtime object first with guarded/stub actions.

During load:

- extensions can register tools/commands/events
- unsafe runtime actions throw until core binds the real implementation
- provider registrations can be queued and flushed after core is ready

After load:

- runner binds real actions
- runner emits lifecycle events
- runner executes handlers in extension load order
- errors are isolated and reported; one bad extension should not crash the whole app unless policy says so

Piclaw should have the same shape:

- `createPiclawExtensionRuntime()`
- `loadPiclawExtension()`
- `PiclawExtensionRunner`
- `bindCore()` to connect storage, connectors, scheduler, models, logger

## Package lessons

Pi packages declare resources in `package.json`:

```json
{
  "pi": {
    "extensions": ["./index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Runtime dependencies belong in `dependencies`.
Pi SDK packages are peer dependencies.

For Piclaw packages:

```json
{
  "piclaw": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@piclaw/sdk": "*"
  }
}
```

## Rule for feature packages

A package is valid only if:

- it imports from `@piclaw/sdk` / public contracts only
- it does not import `apps/piclaw/src/...`
- it does not depend on private app files by relative path
- it registers behavior through the extension API
- it owns its own dependencies and implementation details

The current calendar package violation must be fixed by moving shared contracts/services into public SDK/core, or by exposing a narrow capability through the extension context.

## First implementation target for Piclaw

Start small, Pi-style:

1. Create `packages/piclaw-sdk` with public types:
   - `PiclawExtensionAPI`
   - `PiclawExtensionContext`
   - event names
   - command/tool registration contracts
2. Add a loader in app/core that discovers local extensions.
3. Add a runner that stores registered commands/tools/events.
4. Wire one event and one command first.
5. Convert calendar to an extension that imports only from `@piclaw/sdk`.
6. Add a boundary test that fails if packages import from `apps/piclaw/src`.
