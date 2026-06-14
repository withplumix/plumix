import { os } from "@orpc/server";

import type { AppContext } from "../context/app.js";
import { REST_ERRORS } from "./errors.js";

/**
 * The REST request context: the resolved principal context plus whether it came
 * from a real bearer token (vs the anonymous public principal). Plugin resource
 * auth gates read `restAuthenticated` to enforce `authenticated`.
 */
export interface RestContext extends AppContext {
  readonly restAuthenticated: boolean;
}

export const base = os.$context<RestContext>().errors(REST_ERRORS);
