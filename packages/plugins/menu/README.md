# @plumix/plugin-menu

This Plumix plugin adds **navigation menus** you build in the admin — assembled from your entries, terms, and custom URLs, then dropped into named theme locations.

## Install

```bash
pnpm add @plumix/plugin-menu
```

Then add it to your `plumix.config.ts` and declare the locations your theme renders into:

```ts
import { plumix } from "plumix";

import { menu } from "@plumix/plugin-menu";

export default plumix({
  // …your runtime, database, and auth
  plugins: [
    menu({
      locations: {
        primary: { label: "Primary" },
        footer: { label: "Footer" },
      },
    }),
  ],
});
```

## What you get

- **A `/menus` admin page** (under Appearance) — build menus by dragging in links to entries, terms, or custom URLs, and nest them into a tree.
- **Theme locations** — assign a menu to a location (`primary`, `footer`, …); your theme reads the resolved tree for that slot.
- **Filter hooks** — `menu:item`, `menu:tree`, and `menu:saved` let plugins reshape items, the whole tree, or react to saves.

## Rendering in a theme

Declare the locations a template renders. Each resolves to the menu assigned to it in the admin, or `null` when none is:

```tsx
import { defineTemplate } from "plumix/theme";

// Importing from `/server` is what types `menus` on the template.
import type { ResolvedMenu } from "@plumix/plugin-menu/server";

export default defineTemplate({
  menus: ["primary", "footer"],
  render: ({ menus }) => <Header menu={menus?.primary} />,
});
```

The `/server` entry also resolves menus directly, without pulling in admin code:

```ts
import { getMenuForLocation } from "@plumix/plugin-menu/server";

const primary = await getMenuForLocation(ctx, "primary");
```

`getMenuByName` and `getRegisteredLocations` are available there too.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
