Piclaw context management refactor plan

Goal

- Save the full conversation, both user and agent messages.
- Stop compacting based on message count.
- Compact only when the built model context reaches 70% of the selected model context window.
- Preserve and send useful work context to the model:
  - files read
  - files written/edited
  - shell commands/actions
  - tool calls and results when useful
- Use Pi session-context design as the main reference.

Current Piclaw behavior

- User Telegram text is saved to short memory:
  - `data/runtime/short-memory/<conversation>-server-root.json`
  - capped at 30 messages.
- Bot replies are also saved to short memory.
- Before every task Piclaw creates a new in-memory Pi session:
  - `SessionManager.inMemory()` in `apps/piclaw/src/agent/pi-task.ts`
  - no persistent Pi session is reused.
- Piclaw builds one large text prompt in `apps/piclaw/src/agent/usage.ts`.
- The prompt includes:
  - root path
  - mode
  - model
  - global long-term memory
  - global session summary
  - last 15 Telegram messages
  - current user task
  - reply/tool rules
- Current compaction happens when short memory has more than 20 messages:
  - compact old messages
  - keep last 15 raw messages
  - write summary to global `data/runtime/summary.md`
- Current problem:
  - full history is not saved
  - compaction trigger is message-count based, not token-usage based
  - summary is global, while short memory is per conversation
  - files/actions/tool activity are not stored as first-class context
  - final model input is plain text concatenation, not structured session context

How Pi handles session context

Reference files checked:

- Pi docs:
  - `docs/session-format.md`
  - `docs/compaction.md`
- Pi runtime code:
  - `dist/core/session-manager.js`
  - `dist/core/compaction/compaction.js`
  - `dist/core/compaction/utils.js`

Important Pi ideas to copy

- Sessions are persisted as JSONL.
- The first line is a session header.
- Each later line is an entry with:
  - `type`
  - `id`
  - `parentId`
  - `timestamp`
- Messages are structured, not just text strings.
- Pi stores:
  - user messages
  - assistant messages
  - tool results
  - bash execution messages
  - custom messages
  - compaction entries
  - branch summaries
  - model changes
- Pi builds context by walking the current branch from leaf to root.
- If a compaction entry exists, Pi sends:
  - compaction summary first
  - kept recent messages after it
- Pi keeps full history in the JSONL file even after compaction.
- Pi compaction is lossy only for what is sent to the model, not for saved history.
- Pi tracks file operations during compaction:
  - read files
  - modified files
- Pi stores these in compaction `details`.
- Pi serializes tool calls and tool results for summarization.
- Tool results are truncated during summarization to avoid huge summaries.

Recommended Piclaw design

1. Add a persistent conversation session store

Create a new per-conversation JSONL session file, similar to Pi.

Suggested location:

- `data/runtime/sessions/<conversationKey>/<rootId>.jsonl`

Suggested entry types:

- `session`
- `message`
- `tool_event`
- `action`
- `compaction`
- `context_snapshot`

Suggested message roles:

- `user`
- `assistant`
- `toolResult`
- `systemContext` if needed

2. Stop truncating raw history

Replace short-memory-as-source-of-truth with session JSONL.

Keep short memory only as a compatibility/read-optimized cache if needed.

The full JSONL session should become the source of truth.

3. Save every important event

On user message:

- append `message` role `user`

On assistant final answer:

- append `message` role `assistant`

On tool start:

- append `tool_event` with:
  - toolCallId
  - toolName
  - arguments if available
  - status `started`

On tool end:

- append `tool_event` with:
  - toolCallId
  - status `ended`
  - result summary if available
  - error if failed

For server tools, explicitly track actions:

- read file
- grep/find/ls
- bash command
- write file
- edit file
- web/code search

4. Track files/actions as first-class context

Maintain cumulative session facts:

- read files
- modified files
- shell commands run
- searches performed
- package/config files touched
- tests run and results

These can be derived from tool events, but store a compact `context_snapshot` after each task for faster context building.

5. Build model context from session entries

Create a `buildConversationContext()` module.

It should send the model:

- Piclaw static instructions
- root path/mode/model
- long-term memory
- latest compaction summary, if any
- cumulative files/actions snapshot
- recent raw messages and recent tool/action events
- current user task

Do not send all raw history forever.
The full raw history stays saved, but model input is budgeted.

6. Trigger compaction at 70% token usage

Remove this logic:

- `shortMemory.length > 20`

Replace with:

- build estimated model context
- get model context window
- if estimated tokens >= 70% of limit, compact

Use existing helpers in `apps/piclaw/src/agent/usage.ts`:

- `calculateContextUsage()`
- `getModelContextLimit()`
- `estimateTokens()`

Important detail:

- If model context limit is unknown, do not auto-compact by percent.
- In that case either skip compaction or use a conservative fallback per provider.

7. Compaction behavior

When compaction triggers:

- summarize older messages/actions
- keep recent raw turns
- keep all unsummarized tool/action events needed for current task
- write a `compaction` entry to the JSONL session
- do not delete old entries

Suggested compaction entry:

```json
{
  "type": "compaction",
  "id": "...",
  "parentId": "...",
  "timestamp": "...",
  "summary": "...",
  "firstKeptEntryId": "...",
  "tokensBefore": 90000,
  "details": {
    "readFiles": [],
    "modifiedFiles": [],
    "commands": [],
    "actions": []
  }
}
```

8. Summary format

Use Pi-style structured summary:

- Goal
- Constraints and preferences
- Progress done/in progress/blocked
- Key decisions
- Next steps
- Critical context
- Read files
- Modified files
- Commands/actions

9. Implementation phases

Phase 1: session storage

- Add `apps/piclaw/src/context/session-store.ts`.
- Add JSONL append/read helpers.
- Add tests for append/read/malformed lines.
- Start saving user and assistant messages to JSONL.

Phase 2: context builder

- Add `apps/piclaw/src/context/context-builder.ts`.
- Move prompt construction out of `usage.ts` or make `usage.ts` call the new builder.
- Build context from session JSONL instead of short memory.

Phase 3: action/file tracking

- Add tool event recording around Pi events.
- Enhance custom server tools to return metadata for read/write/edit/bash.
- Save action snapshots.

Phase 4: 70% compaction

- Replace `compactContextIfNeeded()` in `agent-runner.ts`.
- Trigger compaction from estimated token usage, not message count.
- Write compaction entries into the session JSONL.

Phase 5: migration/compatibility

- Keep existing `memory.md` for long-term memory.
- Stop using global `summary.md` for per-chat session summary.
- Either migrate existing `summary.md` into the first compaction entry or leave it as legacy context until `/new`.

Main files likely to change

- `apps/piclaw/src/agent/agent-runner.ts`
- `apps/piclaw/src/agent/pi-task.ts`
- `apps/piclaw/src/agent/usage.ts`
- `apps/piclaw/src/memory/memory.ts`
- `apps/piclaw/src/core/storage.ts`
- new `apps/piclaw/src/context/session-store.ts`
- new `apps/piclaw/src/context/context-builder.ts`
- new `apps/piclaw/src/context/compaction.ts`
- tests under `apps/piclaw/src/context/*.test.ts`

Open design questions

- Should each Telegram chat/thread get one session forever, or should `/new` start a new session file?
- Should Slack and Telegram share the same session format? Recommended: yes.
- Should Piclaw reuse Pi `SessionManager` directly, or keep its own smaller session store? Recommended: own smaller store first, inspired by Pi.
- How much tool result content should be saved? Recommended: save metadata + truncated preview; optionally save full large output to side files.
- Should extension commands be allowed to inject context entries? Recommended: yes, later via `context_build` event.

Proposed first PR

- Add the session JSONL store.
- Save every user and assistant message.
- Keep existing prompt behavior unchanged.
- Add tests.

This gives us durable full history before changing compaction and context building.
