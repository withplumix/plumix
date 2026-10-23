---
version: alpha
name: Plumix Engineered Precision
description: >-
  The visual identity of every Plumix surface: the admin, the page editor, the
  docs, the marketing site, the dev error page and the debug bar.
colors:
  background: "#0e0e0e"
  surface: "#131313"
  surface-container-low: "#1c1b1b"
  surface-container: "#201f1f"
  surface-container-high: "#2a2a2a"
  surface-container-highest: "#353534"
  surface-variant: "#353534"
  outline-variant: "#564148"
  outline: "#a48a92"
  on-surface: "#e5e2e1"
  secondary: "#c6c6cf"
  primary: "#ffb0ce"
  primary-container: "#ea5e9f"
  on-primary-container: "#1a0010"
  tertiary: "#78dd63"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  background-light: "#faf8f7"
  surface-light: "#ffffff"
  surface-container-low-light: "#f6f3f2"
  surface-container-light: "#f0eded"
  surface-container-high-light: "#eae7e6"
  surface-container-highest-light: "#e4e1e0"
  surface-variant-light: "#e4e1e0"
  outline-variant-light: "#d8c2ca"
  outline-light: "#7d6b72"
  on-surface-light: "#1c1b1b"
  secondary-light: "#46464f"
  primary-light: "#a3245f"
  primary-container-light: "#b8306f"
  on-primary-container-light: "#ffffff"
  tertiary-light: "#1f6d14"
  error-light: "#ba1a1a"
  on-error-light: "#ffffff"
  error-container-light: "#ffdad6"
  on-error-container-light: "#410002"
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: 600
    lineHeight: 52px
    letterSpacing: -0.04em
  display-accent:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: 400
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: 600
    lineHeight: 38px
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: 500
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label-ui:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: -0.01em
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.02em
  label-eyebrow:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.08em
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 20px
  gutter: 24px
  xl: 32px
  grid: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 20px
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-container}"
  button-secondary:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-secondary-hover:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
  button-ghost:
    backgroundColor: "{colors.background}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
  command-box:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.code-block}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 24px
  card-description:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
  chip:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  eyebrow:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.label-eyebrow}"
  code-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.code-block}"
    rounded: "{rounded.md}"
    padding: 16px
  code-keyword:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
  code-string:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 6px 8px
  nav-item-active:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface}"
  table-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.outline}"
    typography: "{typography.label-eyebrow}"
  table-row-hover:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
  error-panel:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
    typography: "{typography.code-block}"
    rounded: "{rounded.md}"
    padding: 16px
  button-primary-light:
    backgroundColor: "{colors.primary-container-light}"
    textColor: "{colors.on-primary-container-light}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 20px
  button-primary-hover-light:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.on-primary-container-light}"
  button-secondary-light:
    backgroundColor: "{colors.surface-container-light}"
    textColor: "{colors.on-surface-light}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-secondary-hover-light:
    backgroundColor: "{colors.surface-container-high-light}"
    textColor: "{colors.on-surface-light}"
  button-ghost-light:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.secondary-light}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
  input-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.on-surface-light}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
  command-box-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.on-surface-light}"
    typography: "{typography.code-block}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  card-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.on-surface-light}"
    rounded: "{rounded.sm}"
    padding: 24px
  card-description-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.secondary-light}"
    typography: "{typography.body-sm}"
  chip-light:
    backgroundColor: "{colors.surface-container-light}"
    textColor: "{colors.secondary-light}"
    typography: "{typography.label-mono}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  eyebrow-light:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.primary-light}"
    typography: "{typography.label-eyebrow}"
  nav-item-light:
    backgroundColor: "{colors.surface-container-low-light}"
    textColor: "{colors.secondary-light}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 6px 8px
  nav-item-active-light:
    backgroundColor: "{colors.surface-container-highest-light}"
    textColor: "{colors.on-surface-light}"
  table-header-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.outline-light}"
    typography: "{typography.label-eyebrow}"
  table-row-hover-light:
    backgroundColor: "{colors.surface-container-low-light}"
    textColor: "{colors.on-surface-light}"
  error-panel-light:
    backgroundColor: "{colors.error-container-light}"
    textColor: "{colors.on-error-container-light}"
    typography: "{typography.code-block}"
    rounded: "{rounded.md}"
    padding: 16px
  divider:
    backgroundColor: "{colors.surface-variant}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.outline-variant}"
    height: 1px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-mono}"
  field-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.body-sm}"
  divider-light:
    backgroundColor: "{colors.surface-variant-light}"
    height: 1px
  divider-strong-light:
    backgroundColor: "{colors.outline-variant-light}"
    height: 1px
  status-success-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.tertiary-light}"
    typography: "{typography.label-mono}"
  field-error-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.error-light}"
    typography: "{typography.body-sm}"
  button-destructive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-destructive-confirm:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  checkbox-checked:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    size: 16px
  button-destructive-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.error-light}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-destructive-confirm-light:
    backgroundColor: "{colors.error-light}"
    textColor: "{colors.on-error-light}"
    typography: "{typography.label-ui}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  checkbox-checked-light:
    backgroundColor: "{colors.on-surface-light}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.sm}"
    size: 16px
---

# Plumix design system

The one visual reference for every Plumix surface. Tokens in the front matter are the normative values; the prose says how to apply them. It follows the [DESIGN.md format](https://github.com/google-labs-code/design.md); lint it with `npx @google/design.md lint DESIGN.md`. [ADR 0047](docs/adr/0047-one-design-md-governs-every-surface.md) records why. Reference mockups of every surface in both modes live in the Google Stitch project "Plumix design system" (`1357935722253395033`); the marketing direction it grew from is in "Plumix marketing" (`14103374253933731500`). The mockups' copy is placeholder; the tokens and rules here win where they disagree.

## Overview

Quiet, confident, engineered. Plumix is a tool developers build with and editors work in all day, so the interface reads like a precise instrument: a warm canvas, hairline borders, a faint blueprint grid, and one pink-plum accent that marks where the eye should land. Every surface ships in dark and light. Dark is the brand's home; light is the same system on warm paper, not an inversion.

- **Structure over ornament.** Hierarchy comes from type scale, contrast and alignment. Decoration is limited to the grid, crosshairs and the accent glow.
- **Warm, not cold.** Neutrals lean warm and outlines lean plum, so the accent belongs to the palette instead of sitting on top of it.
- **Calm by default, loud on purpose.** Most of any screen is neutral. The accent appears on the primary action, the active item and the focus of a section.
- **Mechanical motion.** Interactions respond at once with border and colour shifts and short transitions. Nothing bounces.

The same system scales from dense to expressive. The admin, editor and debug bar use it at high density; the docs at reading density; the marketing site at its most expressive, with large type, the serif accent and glows.

## Colors

The palette is a ladder of warm neutrals, two text tones, and one accent family, defined once per mode. Dark tokens carry the plain name (`surface`); their light counterparts add `-light` (`surface-light`). Components follow the same rule (`card`, `card-light`).

### Dark

- **Background (#0e0e0e):** the canvas under everything.
- **Surface ladder (#131313 → #353534):** `surface`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`. Each step up is one level of nesting or emphasis: panels, cards, hover fills, selected rows.
- **Hairlines:** `surface-variant` (#353534) for borders, often at 40–50% opacity; `outline-variant` (#564148) for crosshairs and quiet dividers; `outline` (#a48a92) for hover borders and tertiary text.
- **Text:** `on-surface` (#e5e2e1) for primary text, `secondary` (#c6c6cf) for body copy, descriptions and code.
- **Accent, "Plumix Pink":** `primary-container` (#ea5e9f) fills primary buttons, active borders, switches and selection. `primary` (#ffb0ce) is the light tint for accent text on dark: eyebrows, links, code keywords. Text on a pink fill is `on-primary-container` (#1a0010), never white.
- **Signal colours:** `tertiary` (#78dd63) for success, connected states and code strings; `error` (#ffb4ab) for error text and wavy underlines, on `error-container` (#93000a) panels with `on-error-container` text.

### Light

- **Background (#faf8f7):** warm paper, softer than white.
- **Surface ladder (#ffffff → #e4e1e0):** white panels and cards, then `surface-container-low-light` to `surface-container-highest-light` for nesting, hover fills and selected rows.
- **Hairlines:** `surface-variant-light` (#e4e1e0) for borders; `outline-variant-light` (#d8c2ca) for crosshairs and quiet dividers; `outline-light` (#7d6b72) for hover borders and tertiary text.
- **Text:** `on-surface-light` (#1c1b1b) for primary text, `secondary-light` (#46464f) for body copy.
- **Accent:** the pink deepens so it holds contrast on paper. `primary-container-light` (#b8306f) fills primary buttons with white text; `primary-light` (#a3245f) is accent text: eyebrows, links. The bright `#ea5e9f` survives only as glow and active-border colour.
- **Signal colours:** `tertiary-light` (#1f6d14) for success; `error-light` (#ba1a1a) for error text, on `error-container-light` (#ffdad6) panels with `on-error-container-light` (#410002) text.

### Modes

- Every surface follows the operating system's setting and offers a manual toggle. Where no choice is known, the marketing site and the dev tools fall back to dark.
- Code panels stay dark in both modes, so code reads the same everywhere.
- A component's light variant changes colours only; size, type, radius and spacing are identical.

## Typography

Three families, each with one job.

- **Geist** for headings, body and UI labels. Headings are semibold with tight negative tracking.
- **JetBrains Mono** for code, eyebrows, chips, secondary button labels, keyboard hints and any machine value (IDs, slugs, durations).
- **Newsreader** italic for a single emphasis word in a marketing headline ("Publishing, _typed._"), in `primary-container` with a soft pink glow. It never appears in product UI.

Eyebrows are uppercase `label-eyebrow` in `primary`, bracketed and numbered where a page tells a sequence: `[ 02. WRITE A PLUGIN ]`. Product UI stays between `body-sm` and `headline-lg`; `display` and above belong to marketing and docs landing pages.

## Layout

- **Blueprint grid.** Expressive surfaces (marketing, docs landings, empty states) sit on a 32px square grid of 1px lines at `rgba(255,255,255,0.02)` in dark and `rgba(28,27,27,0.04)` in light, with mono `+` crosshairs in `outline-variant` at section corners. Dense product screens drop the grid.
- **Columns.** A 12-column grid on desktop (≥1280px) with 32px margins; 9–10 columns on tablet (768–1279px); one column on mobile with 16px margins. Admin screens use fixed panes: navigation sidebar, content, optional inspector.
- **Spacing.** A 4px base: 4, 8, 12, 16, 20, 24, 32. Dense UI works at 8–16; marketing sections use generous vertical padding, one idea per viewport.
- **Neighbours share borders.** Grids of cards and cells sit edge to edge and share one hairline, rather than floating with gaps.

## Elevation & Depth

Depth comes from the surface ladder and border steps, not shadows. A nested element sits one surface step above its parent. Floating layers (menus, popovers, the command palette, dialogs) use `surface-container-high` with a `surface-variant` border and one deep shadow, `0 16px 40px -12px rgba(0,0,0,0.8)` in dark or `0 12px 32px -12px rgba(28,27,27,0.18)` in light.

The accent glow is the only light source: `0 0 16px rgba(234,94,159,0.4)` around primary buttons, and `inset 0 0 0 1px #ea5e9f, 0 0 20px -4px rgba(234,94,159,0.3)` for an active cell or the focus of a section. Flat panels never glow.

## Shapes

Small radii keep the engineered feel. `sm` (2px) for cards, cells and chips; `md` (4px) for buttons, inputs, code panels and menus; `lg` (8px) at most, for dialogs. Full pills are kept for status dots and switch tracks. Corners don't mix within one group.

## Components

- **Buttons.** Primary: pink fill, dark text, glow; one per view. Secondary: `surface-container` with a hairline border and mono label; hover lifts the fill one step and the border to `outline`. Ghost: no fill, `secondary` text, for toolbars and tertiary actions.
- **Inputs.** 36px high on `background`, hairline border; focus turns the border pink with a 1px pink ring. Errors use `error` text and border.
- **Command box.** Mono, `>` prompt, copy button on the right. For install commands and CLI snippets everywhere.
- **Cards and cells.** `surface` on a hairline, icon (Material Symbols Outlined), mono name, `secondary` description, optional arrow top-right. Hover changes the border to `outline`; no lift.
- **Chips and status pills.** Chips: `surface-container`, mono `secondary` text. Status pills: pink tint fill (`primary-container` at 20%), pink 40% border and a 6px pulsing dot for live states.
- **Code panel.** `surface` body, header bar with a pink dot, the filename and a mono tag. `secondary` base text, keywords `primary`, strings `tertiary`, comments `outline`. The current or failing line gets a 2px pink left border.
- **Navigation.** Sidebar items in `label-ui`, `secondary` text; the active item lifts to `surface-container-highest` with `on-surface` text and a pink marker.
- **Tables.** Header row in `label-eyebrow` `outline`; rows divided by hairlines; hover fills `surface-container-low`. Status cells use chips.
- **Error panel.** `error-container` fill with `on-error-container` mono text, used by the dev error page and validation summaries.
- **Switch.** `surface-variant` track, light thumb; on turns the track pink.
- **Checkbox and radio.** Hairline box on the current surface; checked fills with `on-surface` and draws the mark in the background colour. They stay neutral so a form full of choices doesn't fill the screen with pink.
- **Destructive actions.** `button-destructive` is outlined: surface fill, `error` text and border. The filled `button-destructive-confirm` appears only inside the confirmation dialog that follows.
- **States.** Hover moves a row or cell one surface step up; selected uses the strongest step (`surface-container-highest`). Hover never looks like selection.
- **Logo.** Plumix has no logo mark yet. Surfaces use the "Plumix" wordmark in Geist semibold; don't invent a mark.

## Do's and Don'ts

- Do keep one pink primary action per view.
- Do put dark text on the dark-mode pink fill and white text on the light-mode one; white on `#ea5e9f` fails WCAG AA.
- Do use the surface ladder for depth; don't add soft drop shadows to flat panels.
- Do use mono for anything a machine produced: code, IDs, slugs, timings, tool names.
- Don't use Newsreader or `display` sizes in product UI.
- Don't number eyebrows in product UI; `[ 02. … ]` belongs to marketing and docs sequences.
- Don't fill checkboxes or destructive buttons pink; pink is the primary action.
- Don't use the blueprint grid behind dense data screens.
- Don't introduce new greys; pick a step from the surface ladder of the current mode.
- Don't hand-invert a colour for light mode; use its `-light` token.
- Don't use `tertiary` or `error` as decoration; they carry meaning.

## Surfaces

How each surface applies the system.

- **Admin and page editor:** high density, no blueprint grid, `body-md` as the base size, fixed panes, the accent on the primary action and the active nav item.
- **Debug bar and dev error page:** the densest surfaces, mostly mono. The error page leads with an `error-panel`; timelines use `primary-container` bars for app spans and `outline` for framework spans.
- **Docs:** reading density, `body-lg` for prose, code panels for every example, eyebrows for section labels, the grid on landing pages only.
- **Marketing:** the most expressive application. The landing page is one journey that follows a single `events` plugin from first line to production: hero ("Publishing, typed."), write a plugin, one plugin powers every surface, the page editor, break it and your agent sees it (paired), everything is a plugin, your host is an adapter, close ("Start a site. Keep the code."). It talks only about Plumix: no other CMS by name, no comparison tables, no invented metrics. Code on the page comes from `apps/marketing/snippets/`.
