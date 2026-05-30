---
name: wiki
description: Create or maintain Piclaw's Obsidian/Markdown wiki layer. Use when the user asks to create a wiki, add Obsidian vault support, add wiki commands, save chat/thread notes to wiki, search wiki pages, or improve wiki page relationships.
---

You are helping build Piclaw's Obsidian-first wiki memory system.

Goal: keep long-form knowledge in a local Markdown vault that can be opened in Obsidian from day one.

## Style

- Telegram-friendly.
- Short messages.
- Use bullets and code blocks when useful.
- Avoid big headings and tables in final replies.
- Ask one short question only when the requested behavior is unclear.

## Hard rules

- Use plain Markdown files as the source of truth.
- The vault must work in Obsidian without a plugin.
- Do not require an Obsidian CLI for MVP work.
- Do not add a vector DB unless the user explicitly asks or plain search is clearly insufficient.
- Raw source files are append-only/immutable: do not edit existing files under `Raw/`.
- Do not overwrite user-edited wiki pages blindly.
- Preserve existing Obsidian links and frontmatter where possible.
- Do not print secrets from `.env` or auth files.
- Keep generated content traceable to raw/source notes.

## Default repo path

```txt
/home/shmulserver/piclaw-isolated
```

## Current MVP files

```txt
apps/piclaw/src/features/wiki/wiki.ts
apps/piclaw/src/core/storage.ts
apps/piclaw/src/connectors/telegram/connector.ts
apps/piclaw/src/features/wiki/wiki.test.ts
```

## Default vault path

```txt
data/obsidian-vault/
```

## Default vault layout

```txt
data/obsidian-vault/
  Inbox/
  Raw/
  People/
  Projects/
  Topics/
  Decisions/
  Daily/
  index.md
  log.md
```

## Existing MVP commands

```txt
/wiki
/wiki-add <text>
/wiki-search <query>
/wiki-open <query>
```

## Design model

Use two layers:

- Current memory remains for small facts:
  - names
  - preferences
  - important decisions
  - quick recall

- Obsidian wiki is for long-form knowledge:
  - chats
  - project notes
  - docs
  - decisions
  - summaries
  - research

## Wiki write flow

When adding wiki knowledge:

1. Save the original input/source in `Raw/`.
2. Create or update an `Inbox/` note.
3. Search the vault for related pages.
4. Read relevant existing pages before editing.
5. Update or create pages in `People/`, `Projects/`, `Topics/`, or `Decisions/`.
6. Add Obsidian links like `[[Piclaw]]` or `[[Slack Connector]]`.
7. Add source references back to the raw file.
8. Append an entry to `log.md`.
9. Update `index.md` only when useful.

## Relationship strategy

The agent should infer relationships from:

- existing `[[Obsidian links]]`
- filenames and folder placement
- `index.md`
- `log.md`
- search results across Markdown files
- raw source references

Before creating a new page, search for likely existing pages by:

- exact topic name
- aliases/spelling variants
- project name
- person name
- related technical terms

Prefer updating an existing page when it clearly matches. Create a new page when no good match exists.

## Page conventions

Use simple Obsidian-friendly Markdown.

Recommended page structure:

```md
---
type: topic
created: 2026-05-25
updated: 2026-05-25
---

Summary paragraph.

Related:
- [[Piclaw]]
- [[Slack Connector]]

Notes:
- Fact or decision with source reference.

Sources:
- [[Raw/2026-05-25T...-note.md]]
```

Use page types such as:

- `person`
- `project`
- `topic`
- `decision`
- `daily`
- `inbox-note`
- `raw-note`

## Safe editing rules

When editing a non-raw page:

- Read the current file first.
- Preserve frontmatter unless changing it intentionally.
- Preserve user-written sections.
- Prefer appending dated notes over rewriting the whole page.
- If a conflict or contradiction appears, add a short `Open questions` or `Conflicts` note instead of silently replacing old content.

Never edit files in `Raw/` except to create new raw files.

## Search behavior

For `/wiki-search`:

- Return concise matches.
- Include relative file paths.
- Include short excerpts.
- Limit result count.
- Avoid huge files.

For `/wiki-open`:

- Return the best matching relative path.
- Return an Obsidian link when possible.

## Future commands to add when requested

```txt
/wiki-summarize
/wiki-rebuild-index
/wiki-daily
/wiki-link
/wiki-related
```

## Slack support guidance

Telegram support exists first. When adding Slack support:

- Keep shared wiki logic connector-agnostic.
- Put Slack command/event parsing in the Slack connector.
- Replies should stay in the same channel/thread.
- Do not duplicate wiki business logic in the connector.

## Testing guidance

Use the repo testing skill as the source of truth for tests.

For wiki changes, add or update tests in:

```txt
apps/piclaw/src/tests/wiki.test.ts
```

Test with temp directories and avoid touching the real vault when possible.

Before final reply after code changes, run:

```bash
pnpm nx test piclaw
pnpm nx typecheck piclaw
```

## Final message after adding wiki skill/support

Use a short reply like:

```txt
Done.

Added wiki skill:
- .agents/skills/wiki/SKILL.md

It covers:
- Obsidian vault rules
- Raw/Inbox/page flow
- wiki commands
- safe page editing
- tests to run
```
