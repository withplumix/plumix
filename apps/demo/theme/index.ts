import { defineTheme, entry, fallback, forEntryType, notFound } from "plumix";

import { fallback as fallbackTemplate } from "./templates/fallback";
import { notFound as notFoundTemplate } from "./templates/not-found";
import { page } from "./templates/page";
import { single } from "./templates/single";
import { DEFAULT_TOKENS } from "./tokens";

// The `fallback` rule renders every listing route — front page, archive,
// category, tag, author, search — by discriminating the data shape. `entry`
// gives posts the richer article view (and, later, comments); `page` overrides
// it for the `page` type with a metadata-free layout.
export const blogTheme = defineTheme({
  templates: [
    fallback(fallbackTemplate),
    entry(single),
    forEntryType("page").template(page),
    notFound(notFoundTemplate),
  ],
  tokens: DEFAULT_TOKENS,
  css: ["./theme/styles.css"],
  document: {
    titleTemplate: (title) => (title ? `${title} — Blog` : "Blog"),
    meta: [{ name: "theme-color", content: "#fbfaf8" }],
  },
});
