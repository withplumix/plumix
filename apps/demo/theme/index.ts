import {
  defineTheme,
  entry,
  fallback,
  forEntryType,
  notFound,
} from "plumix/theme";

import { fallback as fallbackTemplate } from "./templates/fallback";
import { notFound as notFoundTemplate } from "./templates/not-found";
import { page } from "./templates/page";
import { single } from "./templates/single";
import { DEFAULT_TOKENS } from "./tokens";

/**
 * The `fallback` rule renders every listing route by discriminating the data
 * shape; `page` overrides `entry` with a metadata-free layout.
 */
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
