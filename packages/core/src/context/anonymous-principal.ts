import type { AppContext } from "./app-context.js";

type PrincipalFields = Pick<
  AppContext,
  "user" | "tokenScopes" | "apiToken" | "credential" | "auth"
>;

/** Shared by every anonymous context, so none can grant what another does not. */
export const ANONYMOUS_PRINCIPAL: PrincipalFields = Object.freeze({
  user: null,
  tokenScopes: null,
  apiToken: null,
  credential: null,
  auth: Object.freeze({ can: () => false }),
});
