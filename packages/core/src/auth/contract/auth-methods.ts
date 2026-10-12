import type { RendererOAuthProvider } from "../../blocks/renderer/context.js";

export interface AuthMethodsSummary {
  /** Passkey is always configured, so this is always `true` today. */
  readonly passkey: boolean;
  /** True when `auth.magicLink` is configured. */
  readonly magicLink: boolean;
  /** `{ key, label }` per configured OAuth provider; empty when none. */
  readonly oauth: readonly RendererOAuthProvider[];
}
