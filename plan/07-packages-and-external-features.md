# Phase 7: Packages and External Features

Goal: make features installable and removable as packages.

## Pi inspiration

Pi packages bundle:

- extensions
- skills
- prompts
- themes

Piclaw packages should bundle:

- extensions
- skills
- tools
- cronjobs
- connector plugins
- prompts
- config defaults

## Package examples

Future packages:

- `piclaw-wiki`
- `piclaw-calendar-google`
- `piclaw-whatsapp-summaries`
- `piclaw-voice`
- `piclaw-crm`
- `piclaw-team-standup`

## Package manifest

Use package.json convention:

```json
{
  "name": "piclaw-wiki",
  "keywords": ["piclaw-package"],
  "piclaw": {
    "extensions": ["extensions"],
    "skills": ["skills"],
    "prompts": ["prompts"]
  }
}
```

## Install sources

Support later:

- local path
- npm package
- git URL

Start simple:

- local package paths from config

## Implementation steps

1. Define package manifest format.
2. Add local package discovery.
3. Load extension and skill resources from packages.
4. Add package tests with fixtures.
5. Later add install/remove/update commands.

## Done when

- Wiki can live in a package.
- Calendar can live in a package.
- Removing the package removes the feature without core edits.
