import { defineTheme } from "plumix";

import { single } from "./templates/single";
import { fallback } from "./templates/fallback";
import { DEFAULT_TOKENS } from "./tokens";

// `index` (the universal fallback) renders every listing route — front page,
// archive, category, tag, search — by discriminating the data shape. `single`
// is the only dedicated slot: posts get the richer article view (and, later,
// comments).
export const blogTheme = defineTheme({
  templates: { index: fallback, single },
  tokens: DEFAULT_TOKENS,
  css: ["./theme/styles.css"],
  document: {
    titleTemplate: (title) => (title ? `${title} — Blog` : "Blog"),
    meta: [{ name: "theme-color", content: "#fbfaf8" }],
  },
});
