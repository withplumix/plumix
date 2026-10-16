import type { RedirectOptions, SignedIn } from "plumix/auth/client";
import { defineAuthMethodClient } from "plumix/auth/client";

/** What the `request` route's `notice("sent")` answers a fetch with. */
interface CodeSent {
  readonly ok: true;
}

const emailCodeClient = defineAuthMethodClient("email-code", (kernel) => ({
  sendCode: ({ email }: { readonly email: string }) =>
    kernel.post<CodeSent>("request", { email }),
  signIn: ({
    email,
    code,
    redirectTo,
  }: { readonly email: string; readonly code: string } & RedirectOptions) =>
    kernel.post<SignedIn>("verify", { email, code }, { redirectTo }),
}));

export default emailCodeClient;
