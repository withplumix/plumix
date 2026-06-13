import { os } from "@orpc/server";

import type { AppContext } from "../context/app.js";
import { REST_ERRORS } from "./errors.js";

export const base = os.$context<AppContext>().errors(REST_ERRORS);
