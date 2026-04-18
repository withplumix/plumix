import { postRouter } from "./procedures/post/index.js";
import { userRouter } from "./procedures/user/index.js";

export const appRouter = {
  post: postRouter,
  user: userRouter,
} as const;

export type AppRouter = typeof appRouter;
