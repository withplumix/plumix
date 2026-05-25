// Uses `createElement` instead of JSX so the plumix config loader
// (jiti) can parse this file when it pulls in the theme template.
// JSX in `.tsx` files loaded via `import` from `plumix.config.ts`
// trips jiti's TypeScript transformer; the Vite worker bundler does
// support JSX, but the config-load pass runs through jiti.

import { createElement } from "react";
import type { ReactNode } from "react";

import { Counter } from "./counter";

export function IndexTemplate(): ReactNode {
  return createElement(
    "html",
    { lang: "en" },
    createElement(
      "head",
      null,
      createElement("title", null, "Plumix minimal"),
    ),
    createElement(
      "body",
      null,
      createElement(
        "header",
        { "data-testid": "theme-header" },
        createElement("h1", null, "Plumix minimal"),
        createElement(Counter, { label: "header" }),
      ),
      createElement(
        "main",
        null,
        createElement("p", null, "Static content (no JS)."),
      ),
    ),
  );
}
