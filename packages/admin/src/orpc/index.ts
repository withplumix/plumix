import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { createRpcClient } from "./client.js";

// Single shared instance for the whole admin app. Consume as
// `useQuery(orpc.post.list.queryOptions({ input }))` etc. No React context
// needed — the returned helpers are pure functions that feed QueryClient.
export const orpc = createTanstackQueryUtils(createRpcClient());
