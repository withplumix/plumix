import { postRouter } from "./procedures/post/index.js";
import { termRouter } from "./procedures/term/index.js";
import { userRouter } from "./procedures/user/index.js";

export const appRouter = {
  post: postRouter,
  term: termRouter,
  user: userRouter,
} as const;

export type AppRouter = typeof appRouter;
