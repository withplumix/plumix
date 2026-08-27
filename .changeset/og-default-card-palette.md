---
"@plumix/plugin-og": minor
---

The bundled default card now paints in the theme's palette. It reads three of the theme's `color`
tokens — `background` for its ground, `foreground` for the headline, `muted-foreground` for the site
name beneath it — so a theme spelling its palette those three ways gets a card that looks like the
rest of the site for declaring nothing: no `ogCards`, no option.

A theme that names its colours its own way says so once, on the plugin:

```ts
og({
  palette: { background: "paper", foreground: "ink", mutedForeground: "muted" },
});
```

Each key is a role the card paints and each value is one of the theme's `color` slugs. A role left
out keeps the convention name. Only colour follows the theme: the card's spacing and type sizes are
its own.

Resolution is all-or-nothing. A theme naming two of the three keeps the card's own palette entirely
rather than mixing the two, because the theme's paper under the bundled card's near-white ink is an
unreadable card — a worse failure than a card that merely looks unlike the site. A token declared
without a `value` does not resolve either: a card renders away from the page, where the theme's own
stylesheet never loads, so a custom property the theme's CSS defines is one the card cannot read.

A theme that declares no tokens renders exactly the card it did before, and a card a theme declares
is unaffected — it styles itself from the same tokens directly, under whatever names it likes. The
default card's stylesheet changed shape to carry this, so every stored default card is re-keyed
once and re-rendered on first request.
