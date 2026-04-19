import type { RouterClient } from "@orpc/server";

import { optionRouter } from "./procedures/option/index.js";
import { postRouter } from "./procedures/post/index.js";
import { termRouter } from "./procedures/term/index.js";
import { userRouter } from "./procedures/user/index.js";

export const appRouter = {
  post: postRouter,
  term: termRouter,
  user: userRouter,
  option: optionRouter,
} as const;

export type AppRouter = typeof appRouter;

// Pre-typed client shape for consumers (admin, plugins). Re-exporting the
// applied RouterClient<AppRouter> keeps @orpc/server out of consumers'
// dependency trees — they see this as a plain type from @plumix/core.
export type AppRouterClient = RouterClient<AppRouter>;
