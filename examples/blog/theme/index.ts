import { defineTheme } from "plumix";

import { home } from "./templates/home";
import { single } from "./templates/single";
import { fallback } from "./templates/fallback";
import { DEFAULT_TOKENS } from "./tokens";

// One consumer (this example's config), so the theme is exported directly
// rather than behind a factory.
export const blogTheme = defineTheme({
  templates: { index: fallback, home, single },
  tokens: DEFAULT_TOKENS,
  css: ["./theme/styles.css"],
  document: {
    titleTemplate: (title) => (title ? `${title} — Blog` : "Blog"),
    meta: [{ name: "theme-color", content: "#fbfaf8" }],
  },
});
