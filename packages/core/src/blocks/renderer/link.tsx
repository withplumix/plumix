import type { AnchorHTMLAttributes, ReactNode } from "react";

import { withBasePath } from "../../base-path.js";
import { sanitizeHref } from "../marks/safe-href.js";
import { useBasePath } from "./context.js";

/**
 * A domain object (entry/term) carrying a pre-resolved, basePath-correct
 * permalink; `url` is null when there's no public URL.
 */
export interface LinkTarget {
  readonly url: string | null;
}

type AnchorAttrs = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children"
>;

/** Exactly one of `entry` / `term` / `href`. */
export type LinkProps = AnchorAttrs & {
  readonly children?: ReactNode;
} & (
    | { readonly href: string; readonly entry?: never; readonly term?: never }
    | {
        readonly entry: LinkTarget;
        readonly href?: never;
        readonly term?: never;
      }
    | {
        readonly term: LinkTarget;
        readonly href?: never;
        readonly entry?: never;
      }
  );

/** Absolute (`https:`, `mailto:`, `tel:`, …) or protocol-relative (`//`). */
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/**
 * Caller's `rel` plus the safety tokens, de-duplicated — so an explicit
 * `rel` augments rather than drops the external-link protection.
 */
function externalRel(rel: string | undefined): string {
  const tokens = new Set((rel ?? "").split(/\s+/).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

export function Link(props: LinkProps): ReactNode {
  const basePath = useBasePath();
  const { children, entry, term, href, rel, ...rest } = props;

  // `entry`/`term` carry a pre-resolved, basePath-correct url, so only a raw
  // `href` is checked.
  let resolved: string | null;
  let external = false;
  const safeHref = entry || term ? undefined : sanitizeHref(href);
  if (entry) resolved = entry.url;
  else if (term) resolved = term.url;
  else if (safeHref === undefined) resolved = null;
  else if (isExternal(safeHref)) {
    external = true;
    resolved = safeHref;
  }
  // Root-relative hrefs take the basePath; fragment / query / relative hrefs
  // are already correct (withBasePath only handles root-relative paths).
  else if (safeHref.startsWith("/")) {
    resolved = withBasePath(safeHref, basePath);
  } else resolved = safeHref;

  // Unresolvable target (draft with no permalink, or a refused href) degrades
  // to the children with no dead anchor.
  if (resolved === null) return <>{children}</>;

  return (
    <a href={resolved} rel={external ? externalRel(rel) : rel} {...rest}>
      {children}
    </a>
  );
}
