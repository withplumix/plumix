import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { createRpcClient } from "./client.js";

export const orpc = createTanstackQueryUtils(createRpcClient());
