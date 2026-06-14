# Piclaw Packages

A Piclaw package bundles runtime extensions, skills, prompts, tools, cronjobs, connector plugins, or provider setup.

Packages let Piclaw features live outside connector code. Telegram, Slack, and dev CLI should only receive input and send output; packages own commands, tools, callbacks, and feature logic.

## Enable packages

Enable local package paths in `config/piclaw.json`:

```json
{
  "packages": [
    "packages/piclaw-wiki",
    "packages/piclaw-calendar-google",
    "packages/piclaw-voice"
  ]
}
```

Paths may be relative to the repo process directory or absolute.

The example config already enables the current local packages:

- `packages/piclaw-wiki`
- `packages/piclaw-calendar-google`
- `packages/piclaw-voice`

## Disable packages

Remove the package path from `config/piclaw.json`:

```json
{
  "packages": ["packages/piclaw-wiki"]
}
```

Restart Piclaw after changing package config.

Removing a package disables its registered commands, tools, callbacks, skills, and prompts without editing Piclaw core or connector code.

## Package manifest

Each package has a `package.json` with a `piclaw` section:

```json
{
  "name": "piclaw-example",
  "private": true,
  "keywords": ["piclaw-package"],
  "piclaw": {
    "extensions": ["extensions"],
    "skills": ["skills"],
    "prompts": ["prompts"]
  }
}
```

Piclaw currently reads:

- `piclaw.extensions`: files or directories containing extension modules
- `piclaw.skills`: skill directories
- `piclaw.prompts`: prompt directories

Extension directories are scanned for supported files:

- `.ts`
- `.mts`
- `.cts`
- `.js`
- `.mjs`
- `.cjs`

## Create a package

Example structure:

```txt
packages/piclaw-example/
  package.json
  extensions/
    index.ts
  skills/
  prompts/
```

`packages/piclaw-example/package.json`:

```json
{
  "name": "piclaw-example",
  "private": true,
  "keywords": ["piclaw-package"],
  "piclaw": {
    "extensions": ["extensions"],
    "skills": [],
    "prompts": []
  }
}
```

`packages/piclaw-example/extensions/index.ts`:

```ts
export default function (piclaw: any) {
  piclaw.registerCommand({
    name: 'hello',
    description: 'Say hello.',
    handler: (input: any) => `hello ${input.userId ?? 'there'}`,
  });

  piclaw.registerTool({
    name: 'example.double',
    description: 'Double a number.',
    handler: (input: any) => Number(input?.value ?? input) * 2,
  });

  piclaw.registerCallbackAction({
    name: 'example-confirm',
    description: 'Handle example confirmation buttons.',
    pattern: /^example:confirm:.+$/,
    handler: (input: any) => `confirmed ${input.data}`,
  });
}
```

Then enable it:

```json
{
  "packages": ["packages/piclaw-example"]
}
```

## Runtime API

Extensions default-export a function:

```ts
export default function (piclaw) {
  // register runtime resources here
}
```

Available API:

- `piclaw.config`: parsed app config
- `piclaw.logger`: `error`, `warn`, and `info`
- `piclaw.on(name, handler)`: listen to runtime events
- `piclaw.registerCommand(command)`: register slash commands
- `piclaw.registerTool(tool)`: register callable tools
- `piclaw.registerCallbackAction(action)`: register inline-button callback handlers
- `piclaw.registerCronjob(cronjob)`: register scheduled work
- `piclaw.registerProvider(name, provider)`: register model/provider support
- `piclaw.unregisterProvider(name)`: remove provider support

Register methods return an unregister function.

## Commands

Commands are invoked from connector slash commands, for example `/hello`.

```ts
piclaw.registerCommand({
  name: 'hello',
  description: 'Say hello.',
  handler: (input) => 'hello',
});
```

Command input includes:

- `name`
- `args`
- `rawText`
- `conversationId`
- `userId`
- `context`

If the handler returns text, the connector can reply with it.

## Tools

Tools are callable by runtime code and connectors.

```ts
piclaw.registerTool({
  name: 'example.lookup',
  description: 'Look up an example item.',
  handler: async (input) => ({ ok: true, input }),
});
```

Tool names should usually be namespaced, like `wiki.search` or `calendar.create-event`.

## Callback actions

Callback actions handle connector callback data, such as Telegram inline buttons.

```ts
piclaw.registerCallbackAction({
  name: 'example-confirm',
  description: 'Confirm an example action.',
  pattern: /^example:confirm:[a-z0-9-]+$/,
  handler: async (input) => 'confirmed',
});
```

Callback input includes:

- `name`
- `data`
- `connector`
- `conversationId`
- `userId`
- `context`

Keep callback data namespaced so packages do not collide, for example:

```txt
calendaradd:confirm:<id>
calendaradd:cancel:<id>
```

## Events

Packages can listen to runtime events:

```ts
piclaw.on('connector_message', async (event) => {
  piclaw.logger.info(`message from ${event.connector}`);
});
```

Useful events include:

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

## Current local packages

`piclaw-wiki` registers:

- `/wiki`
- `/wiki-add`
- `/wiki-search`
- `/wiki-open`
- `wiki.add-note`
- `wiki.search`

`piclaw-calendar-google` registers:

- `/calendar`
- `/calendar-connect`
- `/calendar-code`
- `/calendar-disconnect`
- `/calendar-today`
- `/calendar-week`
- `/calendar-add`
- `calendar.list-events`
- `calendar.create-event`
- callback actions for `/calendar-add` confirm/cancel

`piclaw-voice` registers:

- `/voice`
- `voice.transcribe-buffer`
- `voice.transcribe-telegram-file`

## Connector boundary

Packages should not call Telegram or Slack APIs directly unless they are explicitly connector packages.

Prefer this flow:

1. Connector receives input.
2. Connector calls runtime command, callback, tool, or event.
3. Package handles feature logic.
4. Connector sends returned text or runtime response.

This keeps connectors thin and makes features reusable across Telegram, Slack, and future connectors.
