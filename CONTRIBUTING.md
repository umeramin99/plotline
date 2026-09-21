# Contributing

Thanks for looking. This project is small on purpose and intends to stay that
way.

## Getting started

There is nothing to install.

```bash
npm test            # 41 tests, node:test, no dependencies
npm run build       # regenerate docs/index.html from src/
npm run examples    # regenerate assets/*.svg from examples/
open docs/index.html
```

## The shape of the code

| Path | What it is |
| --- | --- |
| `src/parse.js` | Text to model. Never throws; problems become warnings |
| `src/render.js` | Model to SVG string. Pure, no DOM |
| `src/measure.js` | Text width without a DOM, so every environment agrees |
| `src/themes.js` | Palettes |
| `src/app.{html,css,js}` | The browser editor |
| `tools/build.mjs` | Inlines the above into one `docs/index.html` |
| `bin/plotline.mjs` | CLI |

`docs/index.html` and `assets/*.svg` are generated and committed, so the demo
and the README work straight from a clone. CI fails if they are stale — run
`npm run build && npm run examples` before pushing.

## House rules

- **No dependencies.** Runtime or dev. If something needs a package, it probably
  does not need to be in this project.
- **No build step to learn.** `tools/build.mjs` concatenates modules after
  stripping `import`/`export`, which is why every top-level name across
  `src/*.js` must be unique. The build fails loudly on a collision.
- **The renderer stays pure.** No DOM, no clock, no filesystem. `render(doc)`
  with the same input produces the same bytes, which is what makes committed
  SVGs diffable.
- **Stay inside the safe SVG subset.** No `<style>`, no `foreignObject`, no
  external references. There is a test for this; it is protecting README
  rendering and PNG export.
- **Parsing failures are warnings, not exceptions.** Someone typing into the
  editor should never see a blank screen.

## Good first changes

- A new theme in `src/themes.js` — self-contained, visible, hard to break.
- Better character widths in `src/measure.js`.
- More examples in `examples/`, which the editor picks up automatically.

## Bigger things worth discussing first

Dependency arrows between items, week-level columns, and an `@import` for
splitting a roadmap across files. Open an issue before writing the code.

## Releasing

`action.yml` is consumed as `umeramin99/plotline@v1`, so that ref has to keep
pointing at a commit where the Action works. It is a **branch**, not a tag, and
moving it is the release:

```bash
git push origin main:v1
```

GitHub resolves `owner/repo@ref` against branches, tags and SHAs alike, so
callers see no difference. Anyone pinning exactly can use a commit SHA.

Only move `v1` for a change that is backwards compatible for existing callers.
A breaking change to the Action's inputs or outputs gets a `v2` branch instead,
so nobody's workflow breaks under them.

## Pull requests

Keep them focused, include a test, and make sure `npm test`, `npm run build`
and `npm run examples` are clean. Screenshots help for anything visual.
