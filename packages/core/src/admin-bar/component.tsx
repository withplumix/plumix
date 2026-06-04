import type { ReactNode } from "react";

import { useQueriedEntry, useUser } from "@plumix/blocks/renderer";

import type { AuthenticatedUser } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import { collectAdminBarNodes } from "./collect.js";

interface PlumixAdminBarProps {
  readonly hooks: HookExecutor;
  readonly request: Request;
}

export function PlumixAdminBar({
  hooks,
  request,
}: PlumixAdminBarProps): ReactNode {
  const user = useUser();
  const queriedEntry = useQueriedEntry();
  if (user === null) return null;
  // Renderer types widen these structurally to keep blocks free of core.
  collectAdminBarNodes(hooks, {
    user: user as AuthenticatedUser,
    queriedEntry,
    request,
  });
  return <header data-testid="plumix-admin-bar" />;
}
