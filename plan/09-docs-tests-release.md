# Phase 9: Docs, Tests, and Release

Goal: make the new architecture understandable and safe to maintain.

## Docs to write

- extension author guide
- connector author guide
- skill guide
- tool guide
- cronjob guide
- package guide
- provider/model/auth guide
- security/trust guide

## Tests

Add tests for:

- extension loading
- event handler order
- event transform/block behavior
- tool registration
- command registration
- cronjob registration
- package discovery
- skill discovery
- connector normalization
- provider registration
- disabling external packages

## Compatibility

Keep Piclaw usable during migration:

- do small phases
- avoid giant rewrites
- preserve current config where possible
- document breaking changes clearly

## Release checklist

Before calling the migration complete:

- typecheck passes
- tests pass
- docs explain how to build a feature externally
- wiki/calendar are external packages
- new feature development no longer requires core edits

## Final success condition

Piclaw core feels like a small engine.

Personal/team workflows are installed as extensions/packages.

That matches the vision:

- simple
- flexible
- minimal
- easy to customize
- inspired by pi.dev
