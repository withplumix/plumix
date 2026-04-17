import { postRouter } from "./procedures/post/index.js";

export const appRouter = {
  post: postRouter,
} as const;

export type AppRouter = typeof appRouter;
