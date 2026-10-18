import type * as AuthFlowRoutes from "./flow-routes.js";
import { loadOnce } from "../load-once.js";

/**
 * Lazy so the webauthn/oslo/arctic graph stays off the public render cold
 * start, and declaring the sign-in methods loads none of the flow code.
 */
export const loadAuthFlowRoutes: () => Promise<typeof AuthFlowRoutes> =
  loadOnce(() => import("./flow-routes.js"));
