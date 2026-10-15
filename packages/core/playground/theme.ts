import type { EntryData, ResolvedEntry } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { ACCESS_POLICY_META_KEY } from "plumix/auth";
import { BlockRenderer } from "plumix/blocks/renderer";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";

import { ratingBlock } from "./blocks/rating.js";
import { AuthProbe } from "./islands/auth-probe.js";
import { Clicker, Counter } from "./islands/counter.js";
import {
  Failing,
  Mismatch,
  Suppressed,
  ThrowOnClick,
} from "./islands/dev-faults.js";
import { LoadProbe } from "./islands/load-probe.js";
import { NestParent } from "./islands/nest-parent.js";
import { DivergeParent, DropParent } from "./islands/parents.js";
import { PrefetchProbe } from "./islands/prefetch-probe.js";
import { Probe } from "./islands/probe.js";
import { SanitizeProbe } from "./islands/sanitize-probe.js";
import { UseAuthProbe } from "./islands/use-auth-probe.js";
import { signInTemplates } from "./sign-in/templates.js";

/**
 * Markup no component emits: `await-children` and an unknown `client`. Vite's
 * dev server serves `/islands/…` from the playground root.
 */
const RAW_ISLANDS = [
  `<plumix-island await-children client="only" chunk-url="/islands/load-probe.ts" component-export="LoadProbe" props='{"label":[0,"raw"]}'></plumix-island>`,
  `<plumix-island client="unknown" chunk-url="/islands/load-probe.ts" component-export="LoadProbe" props="{}"></plumix-island>`,
].join("");

/** Taller than any viewport, so what follows starts below the fold. */
const spacer = (): ReactNode => h("div", { style: { height: "300vh" } });

function islands(): ReactNode {
  return [
    h(
      LoadProbe,
      { key: "load", client: "load", label: "hello" },
      h("strong", { "data-testid": "load-probe-slot" }, "server child"),
    ),
    h(
      "div",
      { key: "only", "data-testid": "client-only-host" },
      h(Probe, { client: "only", testId: "client-only-probe", label: "only" }),
    ),
    h(Probe, {
      key: "dormant",
      client: "interaction",
      testId: "dormant-probe",
      label: "dormant",
    }),
  ];
}

function islandsNested(): ReactNode {
  return [
    h(
      NestParent,
      {
        key: "nest",
        client: "load",
        nested: h(
          Probe,
          { client: "load", testId: "nested-child", label: "nested child" },
          h("em", { "data-testid": "nested-slot" }, "nested slot"),
        ),
      },
      h("em", { "data-testid": "parent-slot" }, "parent slot"),
    ),
    h(Probe, {
      key: "bystander",
      client: "load",
      testId: "bystander",
      label: "bystander",
    }),
    h(
      DropParent,
      { key: "drop", client: "load" },
      h(Probe, { client: "load", testId: "drop-child", label: "drop child" }),
    ),
    h(
      DivergeParent,
      { key: "diverge", client: "load" },
      h(Probe, {
        client: "load",
        testId: "diverge-child",
        label: "diverge child",
      }),
    ),
  ];
}

function islandsRaw(): ReactNode {
  return h("div", {
    "data-testid": "raw-islands",
    dangerouslySetInnerHTML: { __html: RAW_ISLANDS },
  });
}

function strategies(): ReactNode {
  return [
    h(Probe, {
      key: "idle",
      client: "idle",
      testId: "idle-probe",
      label: "idle",
    }),
    h(Probe, {
      key: "above",
      client: "visible",
      testId: "visible-above",
      label: "above the fold",
    }),
    h(
      Counter,
      { key: "counter", client: "interaction" },
      h(Clicker, { client: "interaction", testId: "nested-clicker" }),
    ),
    h("div", { key: "spacer-1" }, spacer()),
    h(Probe, {
      key: "below",
      client: "visible",
      testId: "visible-below",
      label: "below the fold",
    }),
    h("div", { key: "spacer-2" }, spacer()),
    h(PrefetchProbe, {
      key: "prefetch",
      client: "interaction",
      prefetch: "visible",
    }),
  ];
}

function auth(): ReactNode {
  return h(AuthProbe, { client: "load" });
}

function sanitizer(): ReactNode {
  return h(SanitizeProbe, { client: "load" });
}

function authHookIsland(): ReactNode {
  return h(UseAuthProbe, { client: "load" });
}

/**
 * A failed island unmounts, so a fixed row keeps the next one from sliding
 * under the pointer that failed it.
 */
const rowStyle = { height: "3rem" };

/**
 * Each island hydrates on interaction, so a fault raises nothing until a spec
 * acts on it.
 */
function devMismatch(): ReactNode {
  return [
    h(Mismatch, { client: "interaction" }),
    h(Suppressed, { client: "interaction" }),
    h(ThrowOnClick, { client: "interaction" }),
    h(Failing, {
      client: "interaction",
      testId: "failing-first",
      message: "first island failed",
    }),
    h(Failing, {
      client: "interaction",
      testId: "failing-second",
      message: "second island failed",
    }),
  ].map((island, index) => h("div", { key: index, style: rowStyle }, island));
}

/** The dev error page's source view shows this line, markup and all. */
function serverError(): never {
  throw new Error("<b>server error</b>");
}

const FIXTURES: Readonly<Record<string, () => ReactNode>> = {
  auth,
  islands,
  "islands-nested": islandsNested,
  "islands-raw": islandsRaw,
  sanitizer,
  strategies,
  "use-auth": authHookIsland,
  "dev-mismatch": devMismatch,
  "server-error": serverError,
};

function article(resolved: ResolvedEntry): ReactNode {
  const visibility = resolved.storedMeta[ACCESS_POLICY_META_KEY];
  return [
    h(
      "p",
      { key: "visibility", "data-testid": "article-visibility" },
      typeof visibility === "string" ? visibility : "default",
    ),
    h(
      "p",
      { key: "topics", "data-testid": "article-topics" },
      resolved.terms.map((term) => term.name).join(", "),
    ),
    h(BlockRenderer, { key: "blocks", content: resolved.contentBlocks }),
  ];
}

const page = defineTemplate<EntryData>({
  render: ({ data }): ReactNode =>
    h(
      "main",
      null,
      data.entry.type === "article"
        ? article(data.entry)
        : (FIXTURES[data.entry.slug]?.() ??
            h(BlockRenderer, { content: data.entry.contentBlocks })),
    ),
});

export const theme = defineTheme({
  blocks: [ratingBlock],
  templates: [fallback(() => null), entry(page), ...signInTemplates],
  // One token, so the editor specs can pick a style from the theme.
  tokens: { color: { accent: { value: "#b5472d", label: "Accent" } } },
});
