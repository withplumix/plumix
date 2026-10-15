import type { RedirectOptions, SignedIn } from "plumix/auth/client";
import { defineAuthMethodClient } from "plumix/auth/client";

/** The fixture method's browser half: one call signs the fixture account in. */
const fixtureClient = defineAuthMethodClient("fixture", (kernel) => ({
  signIn: (options: RedirectOptions = {}) =>
    kernel.post<SignedIn>("sign-in", {}, options),
}));

export default fixtureClient;
