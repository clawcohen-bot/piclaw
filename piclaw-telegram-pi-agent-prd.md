# PRD: Piclaw Telegram Pi Agent

## Problem / goal

Build a Telegram-controlled Pi SDK agent for personal coding and server management.

The bot should let one trusted user control Pi from Telegram, choose workspaces, run coding tasks, manage short and long-term context, and perform limited server operations with approvals for risky actions.

## Users / stakeholders

- Primary user: Shmulserver, the only allowed Telegram user in v1.
- System owner: same user, responsible for server safety and config.
- Future users: none in v1.

## Scope

### V1 includes

- Telegram bot interface.
- Pi SDK integration.
- One allowed Telegram user ID.
- Multiple configured workspaces.
- Workspace selection by command and buttons.
- Text-only task input.
- One active task per workspace.
- Handling of busy workspace with buttons:
  - Queue
  - Cancel current
  - Ignore
- `/cancel` support.
- Short memory: last 15 Telegram messages per chat/workspace, saved locally, clearable by `/forget`.
- Long-term memory in Markdown:
  - global memory
  - workspace memory
- Manual memory commands:
  - `/remember global ...`
  - `/remember workspace ...`
- Agent-suggested memory updates for stable facts, requiring user approval.
- Tool notifications in Telegram with medium detail.
- Auto-run safe tools.
- Approval required for dangerous tools/actions.
- Server management commands:
  - `/server status`
  - `/server services`
  - `/server logs <service-or-log>`
  - `/server restart <service>` with approval
- Configured allowed services and log paths.
- Local audit log as JSONL.
- Friendly error messages with “show details” option.
- Run as long-running Node polling process.
- Deploy/run via systemd service.
- Use repo-local Pi auth/config from `data/pi`.

## Non-goals

- Multi-user support.
- Public SaaS or team workspace support.
- Telegram file/image handling.
- Deploy commands.
- Arbitrary shell command interface.
- Whole-server unrestricted access.
- Webhook mode.
- Billing, accounts, or permissions model beyond allowlist.
- GitHub/Jira integrations in v1.
- Vector database memory.
- Automatic secret reading.

## Requirements

### Authentication / authorization

- Only one configured Telegram user ID may use the bot.
- All other users receive a short denied response.
- The allowlist must be configured outside Telegram.

### Workspace management

- Workspaces are configured in a config file.
- User can list workspaces.
- User can choose workspace by:
  - `/workspace <name>`
  - Telegram button menu
- All coding tasks run in the selected workspace.
- No default whole-server mode.

### Telegram commands

Required v1 commands:

- `/start` — help and auth status.
- `/workspace` — show/change active workspace.
- `/workspaces` — list allowed workspaces.
- `/remember global ...` — add global memory.
- `/remember workspace ...` — add current workspace memory.
- `/memory` — show global and current workspace memory.
- `/forget` — clear last 15 short-context messages.
- `/status` — show active bot/task status.
- `/cancel` — cancel active task.
- `/server status` — show server status.
- `/server services` — list allowed services.
- `/server logs <service-or-log>` — show allowed logs.
- `/server restart <service>` — restart allowed service after approval.

Normal text messages are sent as Pi tasks.

### Memory

#### Short memory

- Save last 15 Telegram messages per chat/workspace locally.
- Store minimal fields:
  - role
  - text
  - timestamp
  - workspace id
  - Telegram message id
- `/forget` clears this short memory.

#### Long-term memory

- Store Markdown files.
- Suggested structure:

```txt
.memory/
  global.md
  workspaces/
    <workspace>.md
```

- Global memory stores user preferences and general rules.
- Workspace memory stores repo facts, commands, paths, and decisions.
- Manual memory writes require explicit scope.
- Agent may suggest memory updates only for stable facts.
- Suggested memory updates require Telegram approval.

### Pi SDK sessions

- Use hybrid session behavior.
- Default: new Pi task session.
- Allow resume flow later for workspace sessions.
- Use short Telegram context and Markdown memory for each task.
- Use repo-local Pi auth and model settings from `data/pi`.

### Tool execution

- Safe tools may run automatically.
- Dangerous tools require approval.
- Bot sends medium-detail tool notifications, for example:
  - `Reading src/app.ts...`
  - `Running pnpm test...`
- Dangerous actions must show full command/path before approval.

### Dangerous actions

Approval required for:

- File writes/edits.
- Risky shell commands.
- Service restart.
- Reading secret files.
- Package install.
- Delete operations.
- Permission changes.
- Network/firewall changes.
- Any action outside configured workspaces.

Approval behavior:

- Telegram buttons: Approve / Reject.
- Timeout after about 5 minutes.
- Store approval decision in audit JSONL.

### Server management

- Allowed services are configured in config file first.
- Telegram editing of services is not v1.
- Logs support both:
  - allowed systemd services via `journalctl`
  - configured log file paths
- Restart only works for allowed services and requires approval.
- No deploy support in v1.

### Secrets

- Secret files are blocked by default.
- Reading secret paths requires one-time approval.
- Secret values must never be echoed back to Telegram.
- Error/detail views must redact likely secrets.

### Task concurrency

- One active task per workspace.
- If a second task arrives for a busy workspace, ask with buttons:
  - Queue
  - Cancel current
  - Ignore
- Queued tasks are persisted.
- On process restart:
  - active task becomes failed/unknown
  - queued tasks remain available

### Errors

- Show friendly summary by default.
- Add “show details” button for debugging.
- Details should avoid leaking secrets.

### Runtime / deployment

- Long-running Node.js process.
- Telegram polling in v1.
- Run under systemd.
- Bot config path:

```txt
config/telegram-pi-agent.json
```

## UX / flow notes

### First start

1. User sends `/start`.
2. Bot validates Telegram user ID.
3. Bot shows:
   - active workspace, if any
   - command list
   - safety note

### Workspace flow

1. User sends `/workspace`.
2. Bot shows buttons for configured workspaces.
3. User picks one.
4. Bot confirms active workspace.

### Task flow

1. User sends normal text.
2. Bot builds context from:
   - selected workspace
   - last 15 short messages
   - global Markdown memory
   - workspace Markdown memory
3. Bot starts Pi task.
4. Bot sends light progress updates.
5. Bot sends medium-detail tool messages.
6. If risky action is needed, bot asks for approval.
7. Bot sends final summary.
8. Bot may suggest memory updates if stable facts were learned.

### Approval flow

1. Bot shows requested action.
2. Bot shows Approve / Reject buttons.
3. User chooses.
4. Bot continues or skips action.
5. Decision is written to JSONL audit log.

### Busy workspace flow

1. New message arrives while workspace task is running.
2. Bot asks:
   - Queue
   - Cancel current
   - Ignore
3. User chooses one.

## Technical notes / constraints

- Use `@earendil-works/pi-coding-agent` SDK.
- Use `createAgentSession` / runtime APIs as needed.
- Use tool factories when setting custom workspace cwd.
- Use Telegram polling first, not webhook.
- Store bot config under `config/telegram-pi-agent.json`.
- Store audit events as JSONL.
- Store long-term memory as Markdown.
- Store short message context locally because Telegram Bot API cannot freely pull old chat history.
- Text-only v1.
- Existing Pi model/auth config is reused.

## Risks / open questions

- Tool approval may require custom tool wrapping or event handling around Pi tool execution.
- Need exact config schema.
- Need exact secret path patterns.
- Need exact service/log whitelist format.
- Need decide whether write/edit tools are always approval-gated or only when changing files.
- Need decide if Pi session resume is v1 or post-v1.
- Need ensure Telegram formatting escapes safely.
- Need ensure process cancellation actually aborts Pi session and tool calls.

## Acceptance criteria

- Unauthorized Telegram user cannot use the bot.
- Authorized user can select a configured workspace by command and buttons.
- Authorized user can send a coding task and receive a final Pi response.
- Bot includes last 15 messages and Markdown memory in task context.
- `/forget` clears short context.
- `/remember global ...` updates global Markdown memory.
- `/remember workspace ...` updates workspace Markdown memory.
- Agent-suggested memory changes require approval.
- Safe tool usage sends short progress messages.
- Dangerous action asks for approval and respects approve/reject.
- Approval decisions are written to JSONL.
- `/server status` works.
- `/server services` lists configured services.
- `/server logs <name>` works only for allowed logs/services.
- `/server restart <service>` requires approval and only works for allowed services.
- One active task per workspace is enforced.
- Busy workspace prompt offers Queue / Cancel current / Ignore.
- Process restart marks active task failed/unknown but keeps queued tasks.
- Errors show friendly summary and optional details.
- Bot runs as Node polling process under systemd.

## Rollout / validation plan

1. Build local MVP with one workspace and one Telegram user.
2. Test unauthorized user rejection.
3. Test workspace selection.
4. Test simple read-only Pi task.
5. Test code edit task with approval.
6. Test `/forget`, `/remember`, and `/memory`.
7. Test busy workspace behavior.
8. Test server status and logs.
9. Test restart approval with a harmless test service.
10. Run under systemd.
11. Use for real personal tasks.
12. Add GitHub/Jira/files/images only after v1 is stable.
