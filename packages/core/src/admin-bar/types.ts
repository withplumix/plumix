import type {
  AuthenticatedUser,
  AuthNamespace,
} from "../context/app-context.js";
import type { RegisteredEntryType } from "../plugin/manifest.js";
import type { ResolvedEntity } from "../route/current.ts";
import type { BarLocale } from "./i18n.js";

export const ADMIN_BAR_GROUPS = [
  "primary",
  "secondary",
  "+new",
  "account",
  "root",
] as const;

type AdminBarGroup = (typeof ADMIN_BAR_GROUPS)[number];

export interface AdminBarNode {
  readonly id: string;
  readonly title: string;
  readonly href?: string;
  readonly group: AdminBarGroup;
  readonly parent?: string;
  readonly position?: number;
  /**
   * Rendered as a `<button>` wired to the sign-out island, the bar's only JS.
   */
  readonly action?: "signout";
}

export interface AdminBarTreeNode extends AdminBarNode {
  readonly children: readonly AdminBarTreeNode[];
}

export interface BarRenderContext {
  readonly user: AuthenticatedUser;
  readonly queriedEntry: ResolvedEntity | null;
  /**
   * `canEdit` is `canEditEntry`'s answer, so no contributor rebuilds the rule
   * from capabilities.
   */
  readonly queriedEntryDetails?: {
    readonly type: string;
    readonly canEdit: boolean;
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
  /**
   * Core contributors translate through this; plugin contributors pass
   * already-translated `title` strings.
   */
  readonly locale: BarLocale;
  /** Text direction for the bar element — `rtl` for `ar`, `ltr` elsewhere. */
  readonly direction: "ltr" | "rtl";
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "admin_bar:nodes": (
      nodes: readonly AdminBarNode[],
      ctx: BarRenderContext,
    ) => readonly AdminBarNode[];
  }
}
