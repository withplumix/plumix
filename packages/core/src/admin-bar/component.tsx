import type { ReactNode } from "react";

import { useQueriedEntry, useUser } from "@plumix/blocks/renderer";

import type { AuthenticatedUser, AuthNamespace } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { AdminBarTreeNode, BarRenderContext } from "./types.js";
import { buildAdminBarTree } from "./build-tree.js";
import { collectAdminBarNodes } from "./collect.js";

interface PlumixAdminBarProps {
  readonly hooks: HookExecutor;
  readonly request: Request;
  readonly siteName: string;
  readonly auth: AuthNamespace;
  readonly queriedEntryDetails?: BarRenderContext["queriedEntryDetails"];
}

export function PlumixAdminBar({
  hooks,
  request,
  siteName,
  auth,
  queriedEntryDetails,
}: PlumixAdminBarProps): ReactNode {
  const user = useUser();
  const queriedEntry = useQueriedEntry();
  if (user === null) return null;
  // Renderer types widen these structurally to keep blocks free of core.
  const tree = buildAdminBarTree(
    collectAdminBarNodes(hooks, {
      user: user as AuthenticatedUser,
      queriedEntry,
      queriedEntryDetails,
      request,
      siteName,
      auth,
    }),
  );
  return (
    <header data-testid="plumix-admin-bar">
      <ul>
        {tree.map((node) => (
          <BarItem key={node.id} node={node} />
        ))}
      </ul>
    </header>
  );
}

function BarItem({ node }: { readonly node: AdminBarTreeNode }): ReactNode {
  return (
    <li data-testid={`plumix-admin-bar-node-${node.id}`}>
      {node.href ? (
        <a href={node.href}>{node.title}</a>
      ) : (
        <span>{node.title}</span>
      )}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <BarItem key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
