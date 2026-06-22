import type { AuthenticatedUser, AuthNamespace } from "../context/app.js";
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
   * Marks a node as a client action rather than a navigation link. The
   * bar is otherwise zero-JS server chrome; `"signout"` is the single
   * exception, rendered as a `<button>` wired to the inline sign-out
   * island instead of an `<a>`/`<span>`.
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
  /**
   * Resolved bar locale (WP-style — read from `user.meta.locale`, falls
   * back to `en` for unrecognised values). Core contributors translate
   * their literals through this; plugin contributors stay responsible
   * for their own catalogs and pass already-translated `title` strings.
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
