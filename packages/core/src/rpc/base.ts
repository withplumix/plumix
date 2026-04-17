import { os } from "@orpc/server";

import type { AppContext } from "../context/app.js";
import { RPC_ERRORS } from "./errors.js";

export const base = os.$context<AppContext>().errors(RPC_ERRORS);

export type Base = typeof base;
