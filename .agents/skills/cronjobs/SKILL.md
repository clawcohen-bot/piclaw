---
name: cronjobs
description: Design or add repo-local cronjob scaffolding. Use when the user asks to create cron jobs, scheduled tasks, run.sh wrappers, crontab entries, or reusable cronjob templates for this repo.
---

You are helping add safe, repo-local cronjob support.

Goal: create simple cronjob scaffolding only when the user asks for it, and keep it inside the repo.

## Style

- Telegram-friendly.
- Short messages.
- Use bullets and code blocks when useful.
- Avoid big headings and tables.
- Ask one short question when needed.

## Hard rules

- Keep all cronjob files inside the repo unless the user explicitly asks otherwise.
- Do not install system services.
- Do not edit the user's crontab without explicit permission.
- Do not print secrets from `.env` files.
- Do not overwrite an existing cronjob folder without asking.

## Default repo path

```txt
/home/shmulserver/piclaw-isolated
```

## Recommended layout

```txt
.cronjobs/
  README.md
  create-cronjob.sh
  _template/
    run.sh
    job.sh
  <name>/
    run.sh
    job.sh
    .env              # optional
    logs/
      output.log
      error.log
```

## Default behavior

When building cronjob scaffolding, use these defaults unless the user asks otherwise:

- `run.sh` loads repo root `.env` if it exists.
- `run.sh` then loads `.cronjobs/<name>/.env` if it exists.
- Cronjob-specific `.env` overrides repo root `.env`.
- Logs go to:
  - `.cronjobs/<name>/logs/output.log`
  - `.cronjobs/<name>/logs/error.log`
- Use `flock` to prevent overlapping runs.
- If a previous run is active, skip immediately.
- Keep the user-editable task code in `job.sh`.

## Implementation guidance

Create a template `run.sh` that:

- resolves its own directory
- resolves repo root as two directories above the job folder
- creates `logs/`
- exports variables from env files safely
- uses a lock file in the job folder
- runs `job.sh`
- appends stdout and stderr to separate log files
- exits immediately if the lock is already held

Create `create-cronjob.sh` that:

- requires one argument: job name
- rejects empty names
- rejects names containing `/`, `..`, or unsafe shell characters
- refuses to overwrite existing folders
- copies `_template` into `.cronjobs/<name>`
- marks `run.sh` and `job.sh` executable
- prints the crontab line example

Create a placeholder `job.sh` that:

- uses `#!/usr/bin/env bash`
- uses `set -euo pipefail`
- prints a short placeholder message
- tells the user to replace it with the actual task

## Suggested crontab example

```cron
* * * * * /home/shmulserver/piclaw-isolated/.cronjobs/my-job/run.sh
```

## When the user asks to remove cronjob scaffolding

Remove only repo-local cronjob scaffolding, normally:

```txt
.cronjobs/
```

Do not touch the system crontab unless the user explicitly asks.

## Final message after creating scaffolding

Use a short reply like:

```txt
Built cronjob scaffolding.

Added:
- .cronjobs/_template/run.sh
- .cronjobs/_template/job.sh
- .cronjobs/create-cronjob.sh
- .cronjobs/README.md

Create a job:
.cronjobs/create-cronjob.sh my-job
```
