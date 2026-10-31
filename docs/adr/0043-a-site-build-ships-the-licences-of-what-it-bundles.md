# A site build ships the licences of what it bundles

A site's `plumix build` bundles React, Lucide, Drizzle and every other
dependency its theme, plugins and server code import, and the site owner hands
those copies on: the client chunks to every visitor, the server bundle to
whoever runs it. MIT, BSD and Apache-2.0 each require their notice to travel
with a copy. Until #3033 nothing carried it. Vite 8 drops legal comments
whenever it minifies (`comments.legal: !options.minify`, `vitejs/vite`
`packages/vite/src/node/build.ts`), so none of the demo's client chunks kept
React's `@license` header, and the site's plugin admin bundle passed
`legalComments: "none"` to esbuild. Vite leaves the notices to `build.license`
(rolldown-vite#497), which is off by default.

> **`plumix build` turns on Vite's `build.license` with
> `{ fileName: "THIRD-PARTY-NOTICES.md" }` on the top-level `build`, so every
> environment writes a notices file for what it bundles: one in the client
> output, served publicly, and one beside the server bundle. The site's plugin
> admin bundle keeps its legal comments inline (`output.comments.legal`). It
> is on by default, a site turns it off with Vite's own option
> (`vite: { build: { license: false } }` in `plumix.config.ts`), and it only
> reports: no licence fails a site's build.**

## What this means

- **One file per environment, in Vite's format.** Each lists
  `## <name> - <version> (<SPDX>)` followed by that package's licence text.
  Set on the top-level `build`, the option reaches every environment through
  Vite's defaults, so a runtime whose server is a Vite environment gets its file
  with no adapter change.
- **It reports and never gates.** The admin's `rollup-plugin-license`
  allowlist (`packages/admin/vite.config.ts`) fails its build on copyleft
  because Plumix publishes that bundle under MIT. A site owner may lawfully ship
  GPL code, and which licences they accept is theirs to decide.
- **The admin is unchanged.** Its `THIRD-PARTY-NOTICES.txt` and `LICENSE-*.txt`
  come from its own build and are copied with it. They are not merged into the
  site's files, the same way Vite and Angular cover only what their own build
  bundles.
- **The plugin admin bundle carries its notices inline.** Its Rolldown build
  sets `output.comments.legal`, which Vite turns off when it minifies, so each
  bundled legal comment stays in `site-bundle.js` beside the code it covers.

## Considered options

- **Leave it to the site owner.** Rejected: the owner never sees the bundle,
  Vite strips the comments that used to carry the notices, and the option that
  replaces them is one Plumix already decides the build around. Angular CLI's
  `extractLicenses` is the precedent: on by default, one file, browser and
  server bundles. Of the TypeScript CMSs surveyed (Payload, Strapi, Directus,
  Sanity, Keystone, Ghost, Tina, Decap, EmDash), none writes notices for the
  user's build.
- **`rollup-plugin-license` in `plumix build`.** Rejected: it writes with
  `fs.writeFileSync` outside Vite's output pipeline, takes one path for every
  environment, and would become a runtime dependency of every site.
- **Merge the admin's and the plugin bundle's notices into the site's file.**
  Rejected: Vite and Angular cover only what their own build bundles, and the
  admin's notices already sit next to it.
- **A Plumix-specific switch.** Rejected: Vite's option already exists, and
  sites already configure Vite through `plumix.config.ts`.
- **Client only.** Rejected: the server bundle is handed over in some
  deployments (a Docker image, a worker in a client's account), and the file
  there costs nothing.

## Known limits

- Vite reads only a package's `LICENSE`, `LICENCE` or `COPYING` file, not an
  Apache `NOTICE`. None of the four Apache-2.0 packages bundled today
  (class-variance-authority, dompurify, drizzle-orm, drizzle-valibot) ships
  one.
- A package that ships no licence file at all (drizzle-orm, drizzle-valibot and
  launder today) gets its name, version and SPDX identifier with no text.
- Vite skips modules outside `node_modules`, so a workspace app in this repo
  does not list `plumix` itself, while a site installed from npm does.
