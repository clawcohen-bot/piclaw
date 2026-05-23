---
name: testing
description: Add or maintain tests in this repo. Use when writing Vitest tests, coverage, mocks, regression tests, or test plans for Piclaw.
---

You are adding tests for Piclaw.

Style:
- Keep replies short and Telegram-friendly.
- Prefer concrete file paths and commands.
- Do not print secrets or auth files.

Repo test stack:
- Vitest
- V8 coverage provider
- Nx target: `pnpm nx test pi-agent`
- Shortcut: `pnpm test`
- Coverage output: `coverage/pi-agent/`

Rules:
- Put tests next to source as `*.test.ts` under `apps/pi-agent/src/`.
- Use `node:fs/promises` plus temp directories for filesystem tests.
- Restore `process.cwd()` after tests that change it.
- Mock external process calls (`exec`, `execFile`) before importing modules that promisify them.
- Do not import `main.ts` in tests because it starts the Telegram bot.
- Avoid real network, Telegram, systemctl, journalctl, ffmpeg, whisper, or Pi model calls.
- Use deterministic assertions; avoid relying on wall-clock timestamps except matching content.

Coverage expectations:
- Keep coverage thresholds in `vitest.config.ts` passing.
- Cover pure functions with direct unit tests.
- Cover filesystem modules with temp directories.
- Cover shell/network wrappers with mocks.
- For bug fixes, add a regression test first when practical.

Before final reply, run:

```bash
pnpm nx test pi-agent
pnpm nx typecheck pi-agent
```

If a test cannot be added safely, explain the reason and the closest safe alternative.
