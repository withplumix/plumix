import type { RouterClient } from "@orpc/server";

import { authRouter } from "./procedures/auth/index.js";
import { entryRouter } from "./procedures/entry/index.js";
import { optionRouter } from "./procedures/option/index.js";
import { termRouter } from "./procedures/term/index.js";
import { userRouter } from "./procedures/user/index.js";

export const appRouter = {
  auth: authRouter,
  entry: entryRouter,
  term: termRouter,
  user: userRouter,
  option: optionRouter,
} as const;

export type AppRouter = typeof appRouter;

// Pre-applied so consumers don't need @orpc/server in their dep tree.
export type AppRouterClient = RouterClient<AppRouter>;
