---
"plumix": minor
"@plumix/plugin-forms": minor
"@plumix/plugin-media": minor
"@plumix/runtime-node": patch
"@plumix/runtime-bun": patch
"@plumix/runtime-cloudflare": patch
---

Changes how a block is defined, so the editor no longer loads every block's code up front. A block's definition now holds only what the editor needs, and everything that renders or runs on the server moves into a view module the definition imports lazily. This is a breaking change for every block.

Before:

```tsx
export const hero = defineBlock({
  name: "acme/hero",
  title: "Hero",
  loaders: { posts: loadPosts },
  deps: { settings: ["site"] },
  errorFallback: () => <p>Unavailable</p>,
  render: ({ attrs, loaders, deps }) => <Hero {...attrs} />,
});
```

After:

```tsx
// hero.tsx
export const hero = defineBlock({
  name: "acme/hero",
  title: "Hero",
  view: () => import("./hero.view"),
});

// hero.view.tsx
export const loaders = { posts: loadPosts };
export const deps = { settings: ["site"] } as const;
export const errorFallback = () => <p>Unavailable</p>;
export default function HeroView({
  attrs,
}: BlockViewProps<HeroAttrs, typeof loaders, typeof deps>) {
  return <Hero {...attrs} />;
}
```

- `BlockNodeComponent` is now `BlockView` and `BlockNodeRenderProps` is now `BlockViewProps`. A view also receives the block's `name`, so one module can serve several blocks.
- `BlockSpec` takes only the attrs type: write `BlockSpec<HeroAttrs>` where you wrote `BlockSpec<HeroAttrs, typeof loaders, typeof deps>`. A view types its loaders and deps through `BlockViewProps` instead.
- `defineBlock` no longer rejects a dep kind no plugin registered at compile time, because a block's `deps` moved into its view module. A view still can't read a dep key its `BlockViewProps` doesn't declare.
- The server loads every view when the site boots, so pages render the same HTML as before, except that a highlighted code block's `<code>` now carries `data-testid="code-highlighted"` and the HTML block's wrapper `<div>` carries `data-testid="html-block"`. In the editor, the placeholder for a block no plugin registers now carries `data-testid="block-unregistered"`. The editor canvas loads a document's views before showing it, a catalog item's views when you hover or focus it, and the rest when idle, so a block never shows a loading state.
- `renderBlockSpecToHtml` and `renderBlockTreeToHtml` from `plumix/test` now return a promise, and `loadBlockViews` loads the views a test renders outside a site.
- The code block's syntax highlighter and the HTML block's sanitizer leave the editor's eager chunk graph, and the editor's canvas no longer loads the admin's UI kit, which shrinks the editor's initial JavaScript for every site.
- `plumix sync` and every other CLI command no longer import block views, so a view may import CSS.
