import type { ReactNode } from "react";

import { useQueriedEntry, useUser } from "@plumix/blocks/renderer";

import type { AuthenticatedUser, AuthNamespace } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { BarStrings } from "./i18n.js";
import type { AdminBarTreeNode, BarRenderContext } from "./types.js";
import { buildAdminBarTree } from "./build-tree.js";
import { collectAdminBarNodes } from "./collect.js";
import { barDirection, barMessages, resolveBarLocale } from "./i18n.js";
import {
  ADMIN_BAR_BODY_OFFSET_CSS,
  ADMIN_BAR_CSS,
  ADMIN_BAR_NOSCRIPT_CSS,
  ADMIN_BAR_SIGNOUT_SCRIPT,
} from "./styles.js";

interface PlumixAdminBarProps {
  readonly hooks: HookExecutor;
  readonly request: Request;
  readonly siteName: string;
  readonly auth: AuthNamespace;
  readonly queriedEntryDetails?: BarRenderContext["queriedEntryDetails"];
  readonly entryTypes: BarRenderContext["entryTypes"];
}

export function PlumixAdminBar({
  hooks,
  request,
  siteName,
  auth,
  queriedEntryDetails,
  entryTypes,
}: PlumixAdminBarProps): ReactNode {
  const user = useUser();
  const queriedEntry = useQueriedEntry();
  if (user === null) return null;
  const locale = resolveBarLocale(user);
  const direction = barDirection(locale);
  const strings = barMessages(locale);
  // Renderer types widen these structurally to keep blocks free of core.
  const tree = buildAdminBarTree(
    collectAdminBarNodes(hooks, {
      user: user as AuthenticatedUser,
      queriedEntry,
      queriedEntryDetails,
      request,
      siteName,
      auth,
      entryTypes,
      locale,
      direction,
    }),
  );
  return (
    <>
      <style data-testid="plumix-admin-bar-style">{ADMIN_BAR_CSS}</style>
      <style data-testid="plumix-admin-bar-body-offset">
        {ADMIN_BAR_BODY_OFFSET_CSS}
      </style>
      <script
        data-testid="plumix-admin-bar-signout-script"
        dangerouslySetInnerHTML={{ __html: ADMIN_BAR_SIGNOUT_SCRIPT }}
      />
      <noscript>
        <style data-testid="plumix-admin-bar-noscript">
          {ADMIN_BAR_NOSCRIPT_CSS}
        </style>
      </noscript>
      <header
        className="plumix-admin-bar"
        data-testid="plumix-admin-bar"
        dir={direction}
        lang={locale}
      >
        <nav aria-label={strings.navAria}>
          <ul>
            {tree.map((node) => (
              <BarItem key={node.id} node={node} strings={strings} />
            ))}
          </ul>
        </nav>
      </header>
    </>
  );
}

function BarItem({
  node,
  strings,
}: {
  readonly node: AdminBarTreeNode;
  readonly strings: BarStrings;
}): ReactNode {
  if (node.children.length > 0) {
    // `+new` group gets an explicit aria-label so screen readers announce
    // the action ("Create new") instead of the visual "+ New" glyph soup.
    const summaryAria = node.id === "+new" ? strings.newGroupAria : undefined;
    return (
      <li
        data-testid={`plumix-admin-bar-node-${node.id}`}
        className={node.id === "account" ? "plumix-admin-bar__end" : undefined}
      >
        <details>
          <summary aria-label={summaryAria}>
            {node.id === "account" ? (
              <span className="plumix-admin-bar__avatar" aria-hidden>
                {accountInitial(node.title)}
              </span>
            ) : null}
            <BarLabel node={node} />
          </summary>
          <ul>
            {node.children.map((child) => (
              <BarItem key={child.id} node={child} strings={strings} />
            ))}
          </ul>
        </details>
      </li>
    );
  }
  return (
    <li
      data-testid={`plumix-admin-bar-node-${node.id}`}
      className={node.id === "account" ? "plumix-admin-bar__end" : undefined}
    >
      {renderLeaf(node)}
    </li>
  );
}

// Avatar glyph shown in place of the email on mobile (WP collapses the
// "Howdy, name" item to just the avatar). First code point of the email,
// uppercased; `Array.from` keeps astral characters intact.
function accountInitial(email: string): string {
  return (Array.from(email)[0] ?? "?").toUpperCase();
}

// `signout` is the bar's only client action — a `<button>` the inline
// island wires up (the endpoint needs the `X-Plumix-Request` header a
// plain link can't send). Everything else stays a zero-JS link/span.
function renderLeaf(node: AdminBarTreeNode): ReactNode {
  if (node.action === "signout") {
    return (
      <button type="button" data-plumix-signout>
        <BarLabel node={node} />
      </button>
    );
  }
  if (node.href) {
    return (
      <a href={node.href}>
        <BarLabel node={node} />
      </a>
    );
  }
  return (
    <span>
      <BarLabel node={node} />
    </span>
  );
}

// User-supplied strings (account email, queried entry title once contributors
// pass it through) get `<bdi>` wrapping so their script direction can't
// invert the surrounding chrome layout.
function BarLabel({ node }: { readonly node: AdminBarTreeNode }): ReactNode {
  if (node.id === "account" || node.id.startsWith("+new:")) {
    return <bdi>{node.title}</bdi>;
  }
  return <>{node.title}</>;
}
