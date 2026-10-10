import type { EntryData, FrontPageData } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import {
  defineTemplate,
  defineTheme,
  entry,
  fallback,
  frontPage,
} from "plumix/theme";

/**
 * Pages link to each other so the e2e suite can walk between them. Authored
 * with `createElement` (no JSX) so the theme stays transform-agnostic.
 */
const home = defineTemplate<FrontPageData>({
  render: ({ data }): ReactNode =>
    h(
      "ul",
      null,
      data.entries.map((post) =>
        h(
          "li",
          { key: post.id },
          h(
            "a",
            { href: post.url ?? "", "data-testid": `post-link-${post.slug}` },
            post.title,
          ),
        ),
      ),
    ),
});

const post = defineTemplate<EntryData>({
  render: ({ data }): ReactNode =>
    h(
      "main",
      null,
      h("h1", { "data-testid": "post-title" }, data.entry.title),
      h("a", { href: "/" }, "Home"),
    ),
});

export const theme = defineTheme({
  templates: [fallback(() => null), frontPage(home), entry(post)],
  viewTransitions: true,
});
