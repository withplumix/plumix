import { defineLinguiConfig } from "@plumix/lingui-config";

// Per-surface catalog naming keeps each translatable surface's catalog
// distinct in one flat locales/ dir: the SSR admin bar and the zero-theme
// welcome screen each own a `<surface>-{locale}.po` set.
export default defineLinguiConfig({
  surfaces: [
    {
      catalogPath: "<rootDir>/locales/admin-bar-{locale}",
      include: ["src/admin-bar"],
    },
    {
      catalogPath: "<rootDir>/locales/welcome-{locale}",
      include: ["src/welcome"],
    },
  ],
});
