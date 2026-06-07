import { defineLinguiConfig } from "@plumix/lingui-config";

// Per-surface catalog naming: core hosts the admin bar today and a
// debug bar later. `admin-bar-{locale}.po` keeps each surface's
// catalog distinct in one flat locales/ dir.
export default defineLinguiConfig({
  catalogPath: "<rootDir>/locales/admin-bar-{locale}",
  include: ["src/admin-bar"],
});
