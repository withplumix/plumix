import type { ReactNode } from "react";

import { useQueriedEntry, useUser } from "@plumix/blocks/renderer";

import type { AuthenticatedUser, AuthNamespace } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { BarStrings } from "./i18n.js";
import type { AdminBarTreeNode, BarRenderContext } from "./types.js";
import { buildAdminBarTree } from "./build-tree.js";
import { collectAdminBarNodes } from "./collect.js";
import { barDirection, barMessages, resolveBarLocale } from "./i18n.js";
import { ADMIN_BAR_BODY_OFFSET_CSS, ADMIN_BAR_CSS } from "./styles.js";

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
          <summary aria-label={summaryAria}>{node.title}</summary>
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
      {node.href ? (
        <a href={node.href}>
          <BarLabel node={node} />
        </a>
      ) : (
        <span>
          <BarLabel node={node} />
        </span>
      )}
    </li>
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
