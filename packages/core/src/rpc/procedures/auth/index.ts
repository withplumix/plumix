import { session } from "./session.js";

export const authRouter = {
  session,
} as const;

export type AuthRouter = typeof authRouter;
