---
"@plumix/plugin-og": minor
"@plumix/blocks": minor
---

Social cards take their design from the theme's own tokens. Whatever the theme declared in `tokens`
is compiled to a `:root` block of custom properties and handed to the renderer ahead of the card's
own stylesheet, so a card written in ordinary CSS — `var()`, `calc()`, custom properties of its own
— resolves against the same `--plumix-<category>-<slug>` names the site's CSS reads, and a card
that redefines a token wins. The same tokens reach both callbacks as resolved values, for what a
card decides in JavaScript rather than in CSS. Retuning a token lands every card written against it
on a fresh key, so nothing serves the old palette.

Adds `emitThemeTokenCss`, `resolveThemeTokens` and the theme-token types to `plumix/blocks`, so
anything rendering away from the page compiles a theme's tokens without re-spelling the
custom-property naming rule, and reads the same set it styles with.

Cards are now addressed over the theme's tokens as well, so the first request for each card after
this upgrade re-renders it once. The bytes a previous render stored stay in your bucket — as they
do after any card edit — until you remove them.
