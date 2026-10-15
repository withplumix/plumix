"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState } from "react";
import { authClient } from "plumix/auth/client";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * A theme's sign-in surface, written against `authClient` alone: the session,
 * the listed methods, and a control per call the auth e2e drives.
 */
export function AuthProbe(_props: IslandProps<object>): ReactNode {
  const live = useIsLive();
  const { user, isPending } = authClient.useSession();
  const { methods } = authClient.useAuthMethods();
  const [failure, setFailure] = useState("");
  const report = (result: {
    readonly error: { readonly code: string } | null;
  }) => {
    setFailure(result.error?.code ?? "");
  };
  const button = (testId: string, label: string, onClick: () => void) =>
    h("button", { "data-testid": testId, type: "button", onClick }, label);
  return h(
    "div",
    { "data-testid": "auth-probe", "data-live": live ? "" : undefined },
    h(
      "output",
      { "data-testid": "auth-session" },
      isPending ? "pending" : (user?.email ?? "signed out"),
    ),
    h(
      "ul",
      { "data-testid": "auth-methods" },
      methods.map(({ name, label }) =>
        h("li", { key: name, "data-method": name }, label),
      ),
    ),
    button("auth-fixture", "Sign in with the fixture", () => {
      void authClient.signIn.fixture().then(report);
    }),
    button("auth-passkey-register", "Add a passkey", () => {
      if (user === null) return;
      void authClient.passkey.register({ email: user.email }).then(report);
    }),
    button("auth-passkey", "Sign in with a passkey", () => {
      void authClient.signIn.passkey().then(report);
    }),
    button("auth-sign-out", "Sign out", () => {
      void authClient.signOut().then(report);
    }),
    h("output", { "data-testid": "auth-failure" }, failure),
  );
}
