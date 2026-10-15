// Compile-time guard: the fixture plugin's augmentation types its method on
// `authClient`, and a name no plugin registers does not type-check. Nothing
// imports this; the playground's typecheck checks it.
import { authClient } from "plumix/auth/client";

export const fixtureSignIn: () => Promise<unknown> = () =>
  authClient.signIn.fixture();

export const unregistered: unknown =
  // @ts-expect-error -- no plugin registers a `nope` method
  authClient.signIn.nope;
