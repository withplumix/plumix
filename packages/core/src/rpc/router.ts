import type { RouterClient } from "@orpc/server";

import { authRouter } from "./procedures/auth/index.js";
import { optionRouter } from "./procedures/option/index.js";
import { postRouter } from "./procedures/post/index.js";
import { termRouter } from "./procedures/term/index.js";
import { userRouter } from "./procedures/user/index.js";

export const appRouter = {
  auth: authRouter,
  post: postRouter,
  term: termRouter,
  user: userRouter,
  option: optionRouter,
} as const;

export type AppRouter = typeof appRouter;

// Pre-applied so consumers don't need @orpc/server in their dep tree.
export type AppRouterClient = RouterClient<AppRouter>;
