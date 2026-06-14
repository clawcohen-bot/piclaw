# Piclaw Extensions

Piclaw extensions are trusted TypeScript or JavaScript modules that register runtime behavior.

They can live in:

- `~/.piclaw/extensions`
- `<rootPath>/.piclaw/extensions`
- paths from `config/piclaw.json` under `extensions`
- local Piclaw packages from `config/piclaw.json` under `packages`

Use packages when you want a reusable feature bundle. Use plain extensions when you want a small local customization.

## Enable extension paths

```json
{
  "extensions": ["data/piclaw/extensions"]
}
```

Paths may point to a file or a directory. Directories are scanned for supported extension files.

Supported files:

- `.ts`
- `.mts`
- `.cts`
- `.js`
- `.mjs`
- `.cjs`

## Example extension

```ts
export default function (piclaw) {
  piclaw.on('connector_message', async (event) => {
    piclaw.logger.info(`message from ${event.connector}`)
  })

  piclaw.registerCommand({
    name: 'hello',
    description: 'Say hello',
    handler: () => 'hello',
  })

  piclaw.registerCallbackAction({
    name: 'confirm',
    description: 'Handle confirm button payloads',
    pattern: /^confirm:.+$/,
    handler: (input) => `confirmed ${input.data}`,
  })

  piclaw.registerTool({
    name: 'double',
    description: 'Double a number',
    handler: (input) => Number(input) * 2,
  })

  piclaw.registerCronjob({
    name: 'daily-summary',
    schedule: '0 18 * * *',
    handler: async () => {},
  })

  piclaw.registerProvider('local', {
    name: 'local',
    displayName: 'Local provider',
    models: ['local/model'],
  })
}
```

## Runtime API

Extensions receive `piclaw`:

- `piclaw.config`
- `piclaw.logger`
- `piclaw.on(name, handler)`
- `piclaw.registerCommand(command)`
- `piclaw.registerTool(tool)`
- `piclaw.registerCallbackAction(action)`
- `piclaw.registerCronjob(cronjob)`
- `piclaw.registerProvider(name, provider)`
- `piclaw.unregisterProvider(name)`

See `docs/packages.md` for package layout, command/tool/callback examples, and enable/disable instructions.

## Security

- extensions are normal code
- they run with full process permissions
- install only trusted extensions
- project-local extension trust/approval can be added later
