import type { JSX } from "react";

// The document a theme and its templates contribute to: the `<html>` and
// `<body>` attributes and the `<head>` tags. Below the theme contract, so the
// merge that combines a theme's manifest with a template's needs nothing above
// foundation.

/**
 * Strip React-isms that don't belong in HTML attribute descriptors:
 * `key`/`ref` are React infrastructure; `on*` handlers don't apply
 * to SSR'd strings; `children` and `dangerouslySetInnerHTML` are kept
 * only for `<script>` (inline content).
 */
type DocumentTag<T extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[T],
  "key" | "ref" | `on${string}`
>;

export type DocumentLink = Omit<
  DocumentTag<"link">,
  "children" | "dangerouslySetInnerHTML"
>;

export type DocumentMeta = Omit<
  DocumentTag<"meta">,
  "children" | "dangerouslySetInnerHTML"
>;

// `children` and `dangerouslySetInnerHTML` are narrowed to plain strings:
// SSR'd inline script bodies, not React nodes or browser-native trusted-type
// values. JSX would otherwise allow `ReactNode`/`TrustedHTML` here, which
// can't be safely stringified into HTML.
export type DocumentScript = Omit<
  DocumentTag<"script">,
  "children" | "dangerouslySetInnerHTML"
> & {
  readonly position?: "headStart" | "headEnd" | "bodyStart" | "bodyEnd";
  readonly children?: string;
  readonly dangerouslySetInnerHTML?: { readonly __html: string };
};

/**
 * The attribute bag on any of the document tags, as `renderAttrs` reads it.
 * Not JSON: an author writes these as JSX props, so a key can carry `style` as
 * a `CSSProperties` object, and an absent attribute is spelled as a present
 * key holding `undefined` — a state `JsonObject` says cannot happen.
 */
export type DocumentAttrs = Readonly<Record<string, unknown>>;

export interface DocumentManifest {
  readonly html?: Omit<
    DocumentTag<"html">,
    "children" | "dangerouslySetInnerHTML"
  >;
  readonly body?: Omit<
    DocumentTag<"body">,
    "children" | "dangerouslySetInnerHTML"
  >;
  readonly link?: readonly DocumentLink[];
  readonly meta?: readonly DocumentMeta[];
  readonly script?: readonly DocumentScript[];
  readonly title?: string;
  readonly titleTemplate?: string | ((title: string | undefined) => string);
  /**
   * `false` opts the page out of the automatic `<link rel="canonical">` (and
   * the tags a plugin derives from it). A canonical the page declares in
   * `link` still renders. Only `false`: the automatic tag is the default, so
   * there is nothing for `true` to turn back on.
   */
  readonly canonical?: false;
}
