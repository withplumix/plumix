import type { AnchorHTMLAttributes, ReactNode } from "react";

import { useBasePath } from "./index.js";

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

// Mirror of core's `withBasePath` — blocks sits below core in the build
// graph and can't import it.
function withBasePath(path: string, basePath: string): string {
  if (basePath === "") return path;
  return path === "/" ? basePath : `${basePath}${path}`;
}

// Absolute (`https:`, `mailto:`, `tel:`, …) or protocol-relative (`//`).
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

// Caller's `rel` plus the safety tokens, de-duplicated — so an explicit
// `rel` augments rather than drops the external-link protection.
function externalRel(rel: string | undefined): string {
  const tokens = new Set((rel ?? "").split(/\s+/).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

// Script-capable schemes that must never become a clickable href. Strip
// whitespace/control chars (browsers ignore them inside the scheme) and peel
// nested `view-source:` before testing.
function isDangerousHref(href: string): boolean {
  // eslint-disable-next-line no-control-regex -- strips the control chars a scheme could hide behind
  let s = href.replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
  while (s.startsWith("view-source:")) s = s.slice("view-source:".length);
  return /^(?:javascript|data|vbscript|blob):/.test(s);
}

export function Link(props: LinkProps): ReactNode {
  const basePath = useBasePath();
  const { children, entry, term, href, rel, ...rest } = props;

  // Only the `href` member reaches the raw-href branches; `entry`/`term`
  // carry a pre-resolved, basePath-correct url.
  let resolved: string | null;
  let external = false;
  if (entry) resolved = entry.url;
  else if (term) resolved = term.url;
  else if (isDangerousHref(href)) resolved = null;
  else if (isExternal(href)) {
    external = true;
    resolved = href;
  }
  // Root-relative hrefs take the basePath; fragment / query / relative hrefs
  // are already correct (withBasePath only handles root-relative paths).
  else if (href.startsWith("/")) resolved = withBasePath(href, basePath);
  else resolved = href;

  // Unresolvable target (draft with no permalink, or a refused href) degrades
  // to the children with no dead anchor.
  if (resolved === null) return <>{children}</>;

  return (
    <a href={resolved} rel={external ? externalRel(rel) : rel} {...rest}>
      {children}
    </a>
  );
}
