# The Plotline format

A Plotline file is Markdown. That is the whole design goal: a roadmap should
still read like a roadmap on GitHub's plain file view, with no tooling.

Nothing in the format is required. An empty file renders an empty board, and a
file with one bullet renders one card. The parser never throws; anything it
cannot understand becomes a warning you can see in the editor, in `--check`,
and in CI.

---

## Document structure

```markdown
# Title                     first level-1 heading
> Subtitle                  blockquote, joined if repeated

@timeline Q1 2026 -> Q4 2026    directives configure the document
@theme slate

## Lane or column           level-2 and deeper headings
- An item                   bullets under a heading
  - a note about it         indented bullets attach to the item above
// ignored                  comment lines
```

### Modes

There are two, and you pick by what you write:

- **Timeline** — when `@timeline` or `@columns` is present. Headings become
  horizontal lanes and items become bars.
- **Board** — otherwise. Headings become columns and items become cards. This is
  the shape for Now / Next / Later.

`@mode timeline` or `@mode board` overrides the guess. A timeline with no
columns falls back to a board and warns.

---

## Items

```
- Passwordless onboarding @q1..q2 ~80% +ana-rivera #growth !risk
```

Modifiers are read **from the end of the line backwards**, stopping at the first
token that is not a modifier. Everything before that is the title. This is what
lets `Email ana@example.com about #1` stay intact — those tokens are in the
middle of the line, not trailing it.

| Modifier | Meaning | Notes |
| --- | --- | --- |
| `@span` | When the item happens | Timeline mode only; see below |
| `~60%` | Progress | `~60` works too; clamped to 0–100 |
| `+owner` | Who owns it | One token. `+ana-rivera` renders as `ana rivera`; `+"Ana Rivera"` also works |
| `#tag` | What kind of work it is | Drives the item's colour and the legend. Repeatable |
| `!status` | State | `done`, `shipped`, `risk`, `blocked`, `now`. Unknown words are left in the title |

Only the first `@span`, `~progress` and `+owner` on a line are used. Tags
repeat; the first one picks the colour.

### Notes

An indented bullet (two spaces or more) attaches to the item above it:

```markdown
- Guest checkout without an account ~70%
  - Cuts a 4-step flow down to 1
```

Notes show on board cards. Timeline bars have no room for them, so they are
parsed and not drawn.

---

## Spans

A span is one column, or a range of them.

| You write | Means |
| --- | --- |
| `@q2` | That column |
| `@q1..q3` | From the start of the first to the end of the last |
| `@q1->q3` | Same. `..`, `...`, `->`, `→` and ` to ` all separate a range |
| `@2` | The second column, by position |
| `@2026-04-15` | A date, placed proportionally inside its column |
| `@2026-04-15..2026-07-01` | A date range, so bars need not snap to column edges |
| `@2026` | Every column whose label matches — a bare year covers all of it |

Names are matched loosely: case and punctuation are ignored, and a prefix is
enough. With quarterly columns, `@q1` finds `Q1 2026`; add the year
(`@q1-2027`) when more than one year is in view, since a bare `@q1` takes the
first match.

Ranges written backwards (`@q4..q1`) are read the same as forwards. Dates
outside the chart are clamped to its edges.

An item with no span, or one that cannot be resolved, is drawn as a dashed
full-width bar marked `no date`. An unresolvable span also warns, so a typo is
visible rather than silently ignored.

---

## Directives

One per line, anywhere in the file.

| Directive | Effect |
| --- | --- |
| `@timeline Q1 2026 -> Q4 2026` | Quarterly columns |
| `@timeline Jan 2026 .. Jun 2026` | Monthly columns. `2026-01` also works |
| `@timeline 2026 -> 2028` | Yearly columns |
| `@columns Discovery, Build, Launch` | Your own column labels, no date maths |
| `@today 2026-05-14` | Draw the today marker at a date |
| `@today now` | Draw it at render time. Non-deterministic by design |
| `@today q3` | Draw it at a column edge |
| `@theme aurora` | `aurora`, `noir`, `slate`, `dawn`, `sunset` |
| `@width 1600` | Canvas width in px, clamped to 480–4000 |
| `@mode board` | Force a mode |
| `@title` / `@subtitle` | Set them without a heading |
| `@footer off` | Remove the footer. Any other text replaces it |

Both ends of a `@timeline` range must use the same unit. Ranges are capped
(60 months, 40 quarters, 30 years) so a typo cannot produce a chart with ten
thousand columns.

---

## Output

One SVG element, with deliberate limits:

- **No `<style>` blocks.** Presentation attributes only, so GitHub's SVG
  sanitiser leaves the output alone in a README.
- **No `foreignObject`, no external references.** Canvas rasterising never
  taints, which is what makes in-browser PNG export work.
- **No `clipPath`.** Progress fills are their own rounded rectangles, so nothing
  overflows if a renderer drops the clip.
- **Deterministic.** Same input, same bytes — except `@today now`, which is the
  point of `now`. That is what makes it safe to commit a rendered SVG and diff
  it.

Text is measured from a width table rather than a DOM, so the browser, the CLI
and CI produce identical output. The table is calibrated slightly wide, so a
machine without Inter installed truncates a label early rather than overlapping
it.
