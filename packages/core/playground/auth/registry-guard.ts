import { authClient } from "plumix/auth/client";

export const fixtureSignIn: () => Promise<unknown> = () =>
  authClient.signIn.fixture();

export const unregistered: unknown =
  // @ts-expect-error -- no plugin registers a `nope` method
  authClient.signIn.nope;
