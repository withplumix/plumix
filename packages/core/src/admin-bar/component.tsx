import type { ReactNode } from "react";

import type {
  AppContext,
  AuthenticatedUser,
  AuthNamespace,
  Logger,
} from "../context/app-context.js";
import type { EntryEditRow } from "../entries/editability.js";
import type { RegisteredAdminBarNode } from "../plugin/admin-bar-node.js";
import type { BarCatalogs, BarStrings } from "./i18n.js";
import type { AdminBarTreeNode, BarRenderContext } from "./types.js";
import { useQueriedEntry } from "../blocks/renderer/index.js";
import { canEditEntry } from "../entries/editability.js";
import { adminBarViewer } from "../route/render/personal-render.js";
import { buildAdminBarTree } from "./build-tree.js";
import { collectAdminBarNodes } from "./collect.js";
import { barDirection } from "./i18n.js";
import {
  ADMIN_BAR_BODY_OFFSET_CSS,
  ADMIN_BAR_CSS,
  ADMIN_BAR_NOSCRIPT_CSS,
  ADMIN_BAR_SIGNOUT_SCRIPT,
} from "./styles.js";

interface PlumixAdminBarProps {
  readonly viewer: AuthenticatedUser;
  readonly request: Request;
  readonly siteName: string;
  readonly auth: AuthNamespace;
  readonly queriedEntryDetails?: BarRenderContext["queriedEntryDetails"];
  readonly entryTypes: BarRenderContext["entryTypes"];
  readonly nodes: Iterable<RegisteredAdminBarNode>;
  readonly logger: Logger;
  /** The catalogs core's nodes were registered with. */
  readonly catalogs: BarCatalogs;
}

export function PlumixAdminBar({
  viewer,
  request,
  siteName,
  auth,
  queriedEntryDetails,
  entryTypes,
  nodes,
  logger,
  catalogs,
}: PlumixAdminBarProps): ReactNode {
  const queriedEntry = useQueriedEntry();
  const locale = catalogs.resolveLocale(viewer);
  const direction = barDirection(locale);
  const strings = catalogs.strings(locale);
  const tree = buildAdminBarTree(
    collectAdminBarNodes(
      nodes,
      {
        user: viewer,
        queriedEntry,
        queriedEntryDetails,
        request,
        siteName,
        auth,
        entryTypes,
        locale,
        direction,
      },
      logger,
    ),
  );
  // The page offset and sign-out script belong to a bar that renders, so an
  // empty one emits neither.
  if (tree.length === 0) return null;
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

/**
 * Whether the bar shows was decided before the render, so nothing here reads
 * the principal for a page without one.
 */
export function createAdminBarChrome(
  catalogs: BarCatalogs,
): (
  ctx: AppContext,
  queriedEntry: EntryEditRow | undefined,
) => Promise<ReactNode> {
  return async (ctx, queriedEntry) => {
    const viewer = adminBarViewer(ctx);
    if (viewer === null) return null;
    await catalogs.load(catalogs.resolveLocale(viewer));
    return (
      <PlumixAdminBar
        viewer={viewer}
        request={ctx.request}
        siteName={ctx.config.auth.magicLink?.siteName ?? "Site"}
        auth={ctx.auth}
        queriedEntryDetails={
          queriedEntry === undefined
            ? undefined
            : {
                type: queriedEntry.type,
                canEdit: canEditEntry(ctx, queriedEntry),
              }
        }
        entryTypes={ctx.plugins.entryTypes}
        nodes={ctx.plugins.adminBarNodes.values()}
        logger={ctx.logger}
        catalogs={catalogs}
      />
    );
  };
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

/**
 * Replaces the email on mobile, as WP collapses "Howdy, name". `Array.from`
 * keeps astral characters intact.
 */
function accountInitial(email: string): string {
  return (Array.from(email)[0] ?? "?").toUpperCase();
}

/**
 * A `<button>` because the signout endpoint needs the `X-Plumix-Request`
 * header a plain link can't send.
 */
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

/**
 * User-supplied strings (account email, queried entry title once a node
 * passes it through) get `<bdi>` wrapping so their script direction can't
 * invert the surrounding chrome layout.
 */
function BarLabel({ node }: { readonly node: AdminBarTreeNode }): ReactNode {
  if (node.id === "account" || node.id.startsWith("+new:")) {
    return <bdi>{node.title}</bdi>;
  }
  return <>{node.title}</>;
}
