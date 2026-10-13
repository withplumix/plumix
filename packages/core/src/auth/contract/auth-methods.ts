import type { RendererOAuthProvider } from "../../blocks/renderer/context.js";

export interface AuthMethodsSummary {
  /** The listed sign-in methods: core's, then each plugin's in plugin order. */
  readonly methods: readonly {
    readonly name: string;
    readonly label: string;
  }[];
  /** `{ key, label }` per configured OAuth provider; empty when none. */
  readonly oauth: readonly RendererOAuthProvider[];
}
