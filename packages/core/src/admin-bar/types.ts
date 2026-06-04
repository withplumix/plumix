import type { AuthenticatedUser, AuthNamespace } from "../context/app.js";
import type { RegisteredEntryType } from "../plugin/manifest.js";
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
  readonly position?: number;
}

export interface AdminBarTreeNode extends AdminBarNode {
  readonly children: readonly AdminBarTreeNode[];
}

export interface BarRenderContext {
  readonly user: AuthenticatedUser;
  readonly queriedEntry: ResolvedEntity | null;
  /**
   * Pre-resolved details for `queriedEntry.kind === "entry"` — the
   * entry's registered type and `authorId`. Populated by the renderer
   * before the bar collects nodes so sync filter handlers (e.g. the
   * core edit-this contributor) can check capabilities without async
   * DB lookups.
   */
  readonly queriedEntryDetails?: {
    readonly type: string;
    readonly authorId: number;
  };
  readonly request: Request;
  readonly siteName: string;
  readonly auth: AuthNamespace;
  /**
   * Registered entry types in registration order — supplied by the renderer
   * from `app.plugins.entryTypes` so the `+ New` contributor can populate
   * its child menu without a separate discovery API.
   */
  readonly entryTypes: ReadonlyMap<string, RegisteredEntryType>;
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "admin_bar:nodes": (
      nodes: readonly AdminBarNode[],
      ctx: BarRenderContext,
    ) => readonly AdminBarNode[];
  }
}
