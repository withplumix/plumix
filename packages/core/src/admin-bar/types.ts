import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedEntity } from "../route/current.ts";

export const ADMIN_BAR_GROUPS = [
  "primary",
  "secondary",
  "+new",
  "account",
  "root",
] as const;

export type AdminBarGroup = (typeof ADMIN_BAR_GROUPS)[number];

export interface AdminBarNode {
  readonly id: string;
  readonly title: string;
  readonly href?: string;
  readonly group: AdminBarGroup;
  readonly parent?: string;
}

export interface BarRenderContext {
  readonly user: AuthenticatedUser;
  readonly queriedEntry: ResolvedEntity | null;
  readonly request: Request;
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "admin_bar:nodes": (
      nodes: readonly AdminBarNode[],
      ctx: BarRenderContext,
    ) => readonly AdminBarNode[];
  }
}
