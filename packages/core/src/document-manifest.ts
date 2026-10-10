import type { JSX } from "react";

// `children` and `dangerouslySetInnerHTML` are kept only for `<script>`.
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

/**
 * Plain strings: JSX would allow `ReactNode`/`TrustedHTML`, which can't be
 * safely stringified into HTML.
 */
export type DocumentScript = Omit<
  DocumentTag<"script">,
  "children" | "dangerouslySetInnerHTML"
> & {
  readonly position?: "headStart" | "headEnd" | "bodyStart" | "bodyEnd";
  readonly children?: string;
  readonly dangerouslySetInnerHTML?: { readonly __html: string };
};

/**
 * Not JSON: written as JSX props, so `style` can be a `CSSProperties` object
 * and an absent attribute is a key holding `undefined`.
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
   * `false` opts out of the automatic `<link rel="canonical">`; one declared
   * in `link` still renders.
   */
  readonly canonical?: false;
}
