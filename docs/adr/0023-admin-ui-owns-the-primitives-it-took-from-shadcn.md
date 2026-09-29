# admin-ui owns the primitives it took from shadcn

`packages/admin-ui/src` started as shadcn's generated components. For a while
admin-ui's `eslint.config.ts` ignored 37 of those files by name, so they could
stay verbatim and `shadcn diff` upgrades would not merge-conflict.

That stopped being true with the #2719 update. The CLI's output needed its
imports rewritten, Prettier, `rtl: true`, and four Plumix changes restored
before it built. By then the ignore list only hid defects (#2723):

- English in a localized admin: every dialog's and sheet's screen-reader
  "Close", the sidebar's "Toggle Sidebar", and the labels of pagination,
  breadcrumbs and the command dialog.
- Direct `lucide-react` imports in 11 files, bypassing `icons.ts`, which owns
  which icons ship.
- 48 ordinary lint findings, among them an impure render (`Math.random` in
  `SidebarMenuSkeleton`) and a `setState` inside an effect (`useIsMobile`).

It also left an open question (#2637): how is the list kept up to date?

> **The files in `packages/admin-ui/src` that came from shadcn are Plumix
> source. They are linted by the full config, localized, and extended in
> place. Upstream changes come in by review, never by overwrite.**

## What that means

- **No ignore list.** admin-ui's ESLint config lints every file in `src/`. The
  only exemption left switches off the `@shadcn/lint` styling rules for
  `src/**/*.tsx`, because admin-ui is the design system those rules defend.
- **Labels are props.** admin-ui carries no catalog. A primitive that names
  something takes the name as a required prop, and the call site passes it
  already localized, as `sortable.tsx` and `color-picker.tsx` do (#2478).
  `DialogContent`, `SheetContent` and `CommandDialog` take `closeLabel` while
  their close button shows; `DialogFooter` takes it when `showCloseButton` is
  set. `Sidebar` takes `mobileTitle` and `mobileDescription`. `SidebarTrigger`,
  `SidebarRail`, `Breadcrumb`, `BreadcrumbEllipsis`, `Pagination`,
  `PaginationPrevious`, `PaginationNext` and `PaginationEllipsis` take
  `label`. `CommandDialog`'s `title` and `description` have no default.
- **Icons come from `icons.ts`.** A primitive imports its icons from
  `./icons.js` like every other admin component.
- **Extended in place.** A variant, a label prop or a behaviour fix goes into
  the primitive itself. It doesn't need a divergence marker, because nothing
  is verbatim any more.
- **Upstream comes in by review.** Run
  `pnpm dlx shadcn@latest add <name> --diff` from `packages/admin-ui`, read the
  diff, and apply what we want by hand. Never `--overwrite`: it would discard
  the labels, the icon imports and the fixes.

## Considered options

- **Keep them verbatim behind an ignore list** (rejected). The list hides
  unlocalized strings and real lint findings. And it can't be kept verbatim
  anyway: every CLI run needs hand edits before it builds.
- **Wrap them in Plumix components** (rejected). A wrapper doubles the
  surface: two `DialogContent`s, one of them right. It also leaves the raw
  primitive reachable, so a call site can still render the English label.
