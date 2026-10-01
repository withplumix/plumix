import { os } from "@orpc/server";

import type { AppContext } from "../context/app-context.js";
import { RPC_ERRORS } from "./contract/errors.js";

export const base = os.$context<AppContext>().errors(RPC_ERRORS);

export type Base = typeof base;
