# Phase 1: Audit and Core Boundary

Goal: identify what belongs in Piclaw core and what must become external.

## Current code to audit

- `apps/piclaw/src/agent`
- `apps/piclaw/src/connectors`
- `apps/piclaw/src/core`
- `apps/piclaw/src/features`
- `apps/piclaw/src/messages`
- `apps/piclaw/src/memory`
- `apps/piclaw/src/server`

## Core candidates

Keep in core:

- config loading
- connector lifecycle
- agent runner
- message normalization
- model selection
- provider auth hooks
- event bus
- extension loading
- tool registry
- skill discovery
- cronjob scheduler
- storage primitives

## External candidates

Move out of core:

- `features/wiki`
- `features/calendar`
- `features/voice`
- domain-specific summaries
- custom memory behavior beyond basic storage
- team-specific commands
- connector-specific workflows that are not essential

## Pi inspiration

Pi separates:

- runtime: `packages/agent`
- model/provider layer: `packages/ai`
- app shell and extensions: `packages/coding-agent`

Piclaw should copy the idea, not the exact code.

## Deliverables

- Create an audit document listing every module as core or extension.
- Add comments/TODOs where boundaries are unclear.
- No large refactor yet.

## Done when

- Each current feature has a destination:
  - core
  - connector
  - extension
  - package
  - delete/deprecate
