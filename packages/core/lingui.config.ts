import { fileURLToPath } from "node:url";

import { defineLinguiConfig } from "@plumix/lingui-config";

import { discoverCatalogLocales } from "./i18n-compile/index.mjs";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

// Per-surface catalog naming keeps each translatable surface's catalog
// distinct in one flat locales/ dir: the admin-area labels a runtime shows
// outside the admin, the SSR admin bar, the zero-theme welcome screen, the
// block primitives and core's mails each own a `<surface>-{locale}.po` set.
const surfaces = [
  {
    catalogPath: "<rootDir>/locales/admin-area-{locale}",
    include: ["src/admin-area"],
  },
  {
    catalogPath: "<rootDir>/locales/admin-bar-{locale}",
    include: ["src/admin-bar"],
  },
  {
    catalogPath: "<rootDir>/locales/welcome-{locale}",
    include: ["src/welcome"],
  },
  {
    catalogPath: "<rootDir>/locales/blocks-{locale}",
    include: ["src/blocks"],
  },
  {
    catalogPath: "<rootDir>/locales/mail-{locale}",
    include: ["src/mail"],
  },
];

// The `.po` files are the only record of which locales core ships.
export default defineLinguiConfig({
  locales: [
    ...new Set(
      surfaces.flatMap(({ catalogPath }) =>
        discoverCatalogLocales(catalogPath.replace("<rootDir>/", ROOT_DIR)),
      ),
    ),
  ],
  surfaces,
});
