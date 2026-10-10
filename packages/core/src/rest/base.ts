import { os } from "@orpc/server";

import type { AppContext } from "../context/app-context.js";
import { REST_ERRORS } from "./contract/errors.js";

/**
 * `restAuthenticated` is false for the anonymous public principal; plugin
 * resource gates read it.
 */
export interface RestContext extends AppContext {
  readonly restAuthenticated: boolean;
}

export const base = os.$context<RestContext>().errors(REST_ERRORS);
