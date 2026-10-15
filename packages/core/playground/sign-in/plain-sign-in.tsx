import type { ReactNode } from "react";
import { authClient } from "plumix/auth/client";

import { SIGN_IN_ERRORS } from "./messages.js";

export function PlainSignIn({
  request,
}: {
  readonly request: Request;
}): ReactNode {
  const query = new URL(request.url).searchParams;
  const error = query.get("email_code_error");
  const send = authClient.url({ method: "email-code", route: "request" });
  const verify = authClient.url(
    { method: "email-code", route: "verify" },
    { redirectTo: "/account" },
  );
  return (
    <form method="post" action={verify}>
      {query.has("email_code_sent") ? (
        <p data-testid="plain-sign-in-sent">Check your inbox for a code.</p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="plain-sign-in-error" data-code={error}>
          {SIGN_IN_ERRORS[error] ?? "Something went wrong. Try again."}
        </p>
      ) : null}
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        data-testid="plain-sign-in-email"
      />
      <button
        type="submit"
        formAction={send}
        data-testid="plain-sign-in-send-code"
      >
        Email me a code
      </button>
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        data-testid="plain-sign-in-code"
      />
      <button type="submit" data-testid="plain-sign-in-submit">
        Sign in
      </button>
    </form>
  );
}
