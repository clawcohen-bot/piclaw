# Phase 6: Skills, Tools, and Cronjobs

Goal: make capabilities discoverable resources, not hardcoded app features.

## Pi inspiration

Pi skills are progressive disclosure:

- only name and description are always loaded
- full `SKILL.md` is read only when needed
- skills can live globally, locally, or inside packages

Pi tools are registered by core or extensions with schemas.

## Skills

Piclaw should support:

- `.piclaw/skills`
- `.agents/skills`
- global `~/.piclaw/skills`
- package skills
- `SKILL.md` format
- skill metadata in system prompt

## Tools

Tools should be registered through a central registry.

Sources:

- core tools
- connector tools
- extension tools
- package tools

Tool rules:

- typed schema
- clear description
- can stream progress later
- can be intercepted by events

## Cronjobs

Cronjobs should become first-class resources.

A cronjob can be registered by:

- config
- extension
- package

Cronjob shape:

```ts
piclaw.registerCronjob({
  name: "daily-summary",
  schedule: "0 18 * * *",
  handler: async (ctx) => {}
})
```

## Implementation steps

1. Keep existing skills support but align locations and metadata.
2. Add central tool registry.
3. Add event hooks around tool calls/results.
4. Add cronjob registry.
5. Move scheduled summaries to cronjob extension later.

## Done when

- A skill can be added without code changes.
- A tool can be added by extension.
- A cronjob can be added by extension.
