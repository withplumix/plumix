# One DESIGN.md governs every surface

Every Plumix surface styles itself from its own token copy. The admin runs the
stock shadcn neutral theme (`packages/admin/src/styles/globals.css`), the
editor playground repeats it (`packages/admin-editor/playground/playground.css`),
the marketing and demo sites define paper-and-ink values twice each (CSS and
`tokens.ts`), core's dev UI hardcodes hex objects
(`packages/core/src/dev/ui/tokens.ts`), and the docs use Starlight's defaults.
Nothing says what Plumix looks like, so each surface drifts on its own.

> **The root `DESIGN.md` is the one visual reference for the admin, the page
> editor, the docs, the marketing site, the dev error page, the debug bar and
> the admin bar. It follows the
> [DESIGN.md format](https://github.com/google-labs-code/design.md): YAML
> tokens are normative, prose says how to apply them, and
> `npx @google/design.md lint DESIGN.md` passes with no warnings. Surface code
> consumes tokens generated from it and never restates a value.**

## What this means

- **One file, not one per surface.** The format has no way for one file to
  extend another, so per-surface files would each restate the palette and
  drift. Differences between surfaces live in the file's Surfaces section and
  as extra component tokens.
- **Both modes, named by suffix.** The format has no modes. Dark tokens carry
  the plain name (`surface`), light tokens add `-light` (`surface-light`), and
  every component has a light twin, so the linter checks contrast in both.
  Every surface follows the system setting with a manual toggle; the marketing
  site and the dev tools fall back to dark.
- **Code panels stay dark in both modes.** Code reads the same on every
  surface.
- **One accent per view.** Plumix Pink (`#ea5e9f` dark, `#b8306f` light) marks
  the primary action, the active item and focus. Checkboxes stay neutral,
  destructive buttons use the error colour, and pink fills carry dark text in
  dark mode and white text in light mode, the pairs that pass WCAG AA.
- **No logo mark yet.** Surfaces use the "Plumix" wordmark until one exists.
- **The editor canvas and other site content keep the site theme's styling.**
  The system styles Plumix's chrome, never a site, and its variables stay out
  of the `--plumix-<category>-<slug>` namespace site themes own.

## Rollout

The values are locked; no surface changes in the change that adds this record.

1. A token package generates, from `DESIGN.md`, the light and dark CSS values,
   the Tailwind v4 `@theme inline` mapping, the shadcn variable names mapped to
   the new tokens (so `@plumix/admin-ui` and plugin admin screens keep
   working), and a TypeScript export for core's dev UI, which has no CSS
   pipeline. A check fails when the generated files drift from `DESIGN.md`.
   The package is internal; publishing it for site themes is a later decision.
2. Surfaces adopt it one change at a time: the admin and admin-ui, the editor
   chrome (dropping the playground's copy), core's dev UI, the marketing site,
   then the docs through Starlight's Tailwind integration.

## Considered options

- **A DESIGN.md per app.** Rejected: no inheritance in the format, so every
  file restates the tokens.
- **Dark only.** Rejected: the admin already offers a light/dark toggle, and
  editors work in it all day.
- **Keep shadcn's neutral theme and restyle marketing only.** Rejected: the
  product and its site would keep looking like two products.
- **Tokens in a TypeScript or JSON file.** Rejected as the source: DESIGN.md
  carries the rationale beside the values, agents read it directly, and
  `@google/design.md export` already emits Tailwind v4 CSS, CSS variables and
  W3C design tokens from it.

## Consequences

- The admin's look changes for every user when it adopts the tokens: warm
  neutrals, the pink accent and 2–4px radii instead of shadcn's 10px.
- Changing a colour means editing `DESIGN.md`, linting it and regenerating;
  hand edits to generated token files fail the drift check.
- The Stitch mockups' copy is placeholder. Each surface's adopting change takes
  its text from the code, not the mockups.
