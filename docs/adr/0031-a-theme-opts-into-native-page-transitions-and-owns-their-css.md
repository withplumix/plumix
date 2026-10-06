# A theme opts into native page transitions and owns their CSS

The browser can animate a navigation between two documents without a client
router, but only when both documents carry a `@view-transition` rule (#2879).
Plumix renders the whole document, so whether that rule is there is the
framework's call. A theme could paste the rule into its own stylesheet, but then
a site can't switch it off without forking the theme, the editor canvas
animates every reload, and visitors who asked for reduced motion get the
animation anyway.

> **A theme turns on native cross-document view transitions with
> `viewTransitions` on its descriptor, and a template can replace that value for
> the pages it renders. Core emits the `@view-transition` rule, and with it a
> reduced-motion rule that turns transitions off, unless the setting is
> `"always"`. Core also tags each navigation with one transition type:
> `nav-forward`, `nav-back` or `nav-replace`. The theme's CSS writes every
> animation.**

## What this means

- **Off unless asked.** A theme without `viewTransitions` renders the head it
  rendered before, byte for byte. `true`, `"always"` or
  `{ enabled, types }` turn it on; `types` lands in the rule's `types`
  descriptor.
- **A template's value replaces the theme's whole.** There is no per-field
  merge. A site overrides the theme by configuring the descriptor it passes to
  `plumix()`, by spreading it or through a theme factory option. `plumix()`
  gains no key.
- **Only live renders carry it.** The `edit` and `preview` edit modes render
  nothing, so the editor canvas and a draft preview stay plain renders.
- **Reduced motion is core's by default.** The reduced-motion rule sits after
  the `@view-transition` rule because the last `@view-transition` rule in a
  document wins whole. `"always"` drops it and leaves reduced motion to the
  theme.
- **Core ships no public-site animation.** No keyframes, presets or
  `::view-transition-*` rules. The theme keys its CSS on the transition types
  with `:active-view-transition-type()`.
- **The same three type names in the admin.** The admin router tags its own
  navigations with them, so theme and plugin authors learn one set.
- **No runtime validation.** The `ViewTransitionsInput` type is the contract.

## Considered options

- **React's `<ViewTransition>` and the `vt-*` attributes `prerender` emits.**
  React streams those attributes for its own inline script, which reveals
  Suspense boundaries within one document. They say nothing about a navigation
  between documents, and Plumix renders with `renderToString`, which emits none
  of them. React's `<ViewTransition>` stays available inside islands for
  in-island updates.
- **A client router for the public site.** It would animate in every browser
  with JavaScript, but it replaces the browser's navigation, its scroll and
  history handling, and the cache semantics of a plain page load. The native
  feature degrades to an ordinary navigation where it's missing.
- **Animation presets in core.** A cross-fade or slide shipped by core would
  impose a look on every theme that opts in, and a theme would spend its CSS
  undoing it.
- **A key on `plumix()`.** The site already owns the theme value it passes in,
  so a second switch would need a precedence rule for no new capability.
