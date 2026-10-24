import type {
  AuthenticatedUser,
  AuthNamespace,
} from "../context/app-context.js";
import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { RegisteredEntryType } from "./registry.js";

export const ADMIN_BAR_GROUPS = [
  "primary",
  "secondary",
  "+new",
  "account",
  "root",
] as const;

type AdminBarGroup = (typeof ADMIN_BAR_GROUPS)[number];

export type BarLocale = "en" | "de" | "uk" | "ar" | "zh-CN";

export interface BarRenderContext {
  readonly user: AuthenticatedUser;
  readonly queriedEntry: ResolvedEntity | null;
  /**
   * `canEdit` is `canEditEntry`'s answer, so no node rebuilds the rule from
   * capabilities.
   */
  readonly queriedEntryDetails?: {
    readonly type: string;
    readonly canEdit: boolean;
  };
  readonly request: Request;
  readonly siteName: string;
  readonly auth: AuthNamespace;
  /** Registered entry types in registration order. */
  readonly entryTypes: ReadonlyMap<string, RegisteredEntryType>;
  /**
   * Core's nodes translate through this; a plugin's node passes an
   * already-translated `title`.
   */
  readonly locale: BarLocale;
  /** Text direction for the bar element — `rtl` for `ar`, `ltr` elsewhere. */
  readonly direction: "ltr" | "rtl";
}

export interface AdminBarNodeOptions {
  readonly id: string;
  readonly group: AdminBarGroup;
  /** A function when the title depends on the request, as core's do. */
  readonly title: string | ((bar: BarRenderContext) => string);
  /** Must name a registered node; boot fails otherwise. */
  readonly parent?: string;
  /** Sorts within the bar; a node without one sorts after those with one. */
  readonly position?: number;
  /** Breaks a `position` tie ahead of plugin config order. */
  readonly order?: "early" | "late";
  /** Without one, the node renders as text. */
  readonly href?: (bar: BarRenderContext) => string | undefined;
  /** Without one, the node shows on every bar. */
  readonly visible?: (bar: BarRenderContext) => boolean;
}

/** Core's own nodes, which alone may carry an `action`. */
export interface CoreAdminBarNodeOptions extends AdminBarNodeOptions {
  /**
   * Rendered as a `<button>` wired to the sign-out island, the bar's only JS.
   */
  readonly action?: "signout";
}

export interface RegisteredAdminBarNode extends CoreAdminBarNodeOptions {
  /** `null` for core's own nodes. */
  readonly registeredBy: string | null;
}
