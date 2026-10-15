"use client";

import type { AuthClientError } from "plumix/auth/client";
import type { IslandProps } from "plumix/blocks";
import type { ReactNode, SyntheticEvent } from "react";
import { useState } from "react";
import { authClient } from "plumix/auth/client";
import { useIsLive } from "plumix/blocks/renderer";

import { SIGN_IN_ERRORS } from "./messages.js";

/**
 * Two steps in one form: mail a code, then trade it for a session. A passkey
 * button shows when the site lists passkeys.
 */
export function SignInForm(_props: IslandProps<object>): ReactNode {
  const live = useIsLive();
  const { methods } = authClient.useAuthMethods();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<AuthClientError | null>(null);
  const passkeys = methods.some((method) => method.name === "passkey");

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!sent) {
      const sending = await authClient.emailCode.sendCode({ email });
      setError(sending.error);
      setSent(sending.error === null);
      return;
    }
    // Navigates to /account once signed in; only a failure comes back.
    const signingIn = await authClient.signIn.emailCode({
      email,
      code,
      redirectTo: "/account",
    });
    setError(signingIn.error);
  }

  async function signInWithPasskey() {
    const signingIn = await authClient.signIn.passkey({
      redirectTo: "/account",
    });
    setError(signingIn.error);
  }

  return (
    <form
      data-testid="sign-in-form"
      data-live={live ? "" : undefined}
      onSubmit={(event) => void submit(event)}
    >
      {error ? (
        <p role="alert" data-testid="sign-in-error" data-code={error.code}>
          {SIGN_IN_ERRORS[error.code] ?? error.message.message}
        </p>
      ) : null}
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        data-testid="sign-in-email"
      />
      {sent ? (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          data-testid="sign-in-code"
        />
      ) : null}
      <button
        type="submit"
        data-testid={sent ? "sign-in-submit" : "sign-in-send-code"}
      >
        {sent ? "Sign in" : "Email me a code"}
      </button>
      {passkeys ? (
        <button type="button" onClick={() => void signInWithPasskey()}>
          Use a passkey
        </button>
      ) : null}
    </form>
  );
}
