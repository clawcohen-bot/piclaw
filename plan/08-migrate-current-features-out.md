# Phase 8: Migrate Current Features Out

Goal: remove non-core features from Piclaw core after the extension system exists.

## Move out first

- `features/wiki` -> `packages/piclaw-wiki`
- `features/calendar` -> `packages/piclaw-calendar-google`
- `features/voice` -> `packages/piclaw-voice`

## Keep temporarily

During migration, old imports can remain behind compatibility wrappers.

But new behavior should use:

- extension registration
- event handlers
- tools
- commands
- cronjobs
- package resources

## Migration pattern

For each feature:

1. Create package folder.
2. Move feature logic into package.
3. Expose tools/commands through extension entrypoint.
4. Register skills/prompts if needed.
5. Remove direct core imports.
6. Add tests proving package can be disabled.

## Example: wiki

The wiki package should register:

- wiki tools
- wiki commands
- wiki skill
- storage config

Core should know nothing about wiki except that an extension registered tools/commands.

## Example: calendar

The calendar package should register:

- calendar tools
- calendar auth/provider config if needed
- calendar commands
- calendar skill

Core should not import Google Calendar code.

## Done when

- Piclaw starts without wiki/calendar/voice code loaded.
- Installing/enabling the package restores the feature.
- Tests pass both with and without the package.
