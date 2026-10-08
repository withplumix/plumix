import { defineLinguiConfig } from "@plumix/lingui-config";

// Per-surface catalog naming keeps each translatable surface's catalog
// distinct in one flat locales/ dir: the admin-area labels a runtime shows
// outside the admin, the SSR admin bar, the zero-theme welcome screen, the
// block primitives and core's mails each own a `<surface>-{locale}.po` set.
export default defineLinguiConfig({
  surfaces: [
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
  ],
});
