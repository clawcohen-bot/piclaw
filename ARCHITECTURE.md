# Piclaw Architecture Direction

Piclaw should have a small core and a strong extension layer.

The core should provide only the foundations that every Piclaw instance needs.

## Core features

These features belong in Piclaw core:

- Connectors
  - Telegram
  - Slack
  - WhatsApp
  - future message providers
- Model selection
  - choose provider
  - choose model
  - configure defaults
  - allow per-extension overrides
- Provider login/logout
  - authenticate with AI providers and external services
  - store credentials safely
  - disconnect providers cleanly
- Cronjobs and scheduled tasks
  - simple scheduling API
  - repo-local cronjob scaffolding
  - predictable run wrappers
- Skills
  - load skills dynamically
  - allow local and external skill folders
  - make skills easy to add/remove
- Configuration
  - simple config files
  - environment overrides
  - minimal required setup
- Extension API
  - stable hooks
  - register commands
  - register tools
  - register connectors
  - register scheduled jobs
  - register storage providers

## External features

These features should not require code changes in Piclaw core:

- Wiki
- Calendar
- CRM
- task managers
- note-taking systems
- custom bots
- custom automations
- personal workflows
- team-specific workflows

They should be installable as extensions, plugins, skills, or external packages.

## Design rule

If a feature is useful only for some users, it should usually live outside the core.

If a feature makes it easier to build, connect, configure, or run Piclaw itself, it may belong in the core.

## Goal

Piclaw core should feel like a minimal operating layer for personal agents.

Everything personal, opinionated, or workflow-specific should be external and replaceable.
