import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { authClient } from "./index.js";
import { renderWithAuthContext } from "./render-context.js";

const methods = {
  methods: [{ name: "fixture", label: "Fixture" }],
  oauth: [],
};

function AccountMenu(): ReactNode {
  const { user, isPending } = authClient.useSession();
  const { methods: listed } = authClient.useAuthMethods();
  return (
    <form action={authClient.url("signOut", { redirectTo: "/" })}>
      <output>{isPending ? "pending" : (user?.email ?? "signed out")}</output>
      <ul>
        {listed.map(({ name, label }) => (
          <li key={name}>{label}</li>
        ))}
      </ul>
    </form>
  );
}

describe("during a server render", () => {
  test("url, useSession and useAuthMethods read the render's context", () => {
    const { rendered: html } = renderWithAuthContext(
      {
        basePath: "/blog",
        methods,
        user: () => ({
          id: 7,
          email: "jane@example.test",
          name: null,
          avatarUrl: null,
          role: "admin",
          capabilities: ["user:edit_own"],
        }),
      },
      () => renderToString(<AccountMenu />),
    );

    expect(html).toContain(
      'action="/blog/_plumix/auth/signout?redirectTo=%2Fblog"',
    );
    expect(html).toContain("<output>jane@example.test</output>");
    expect(html).toContain("<li>Fixture</li>");
  });

  test("reports whether the render read the session, and what it read", () => {
    const user = {
      id: 7,
      email: "jane@example.test",
      name: null,
      avatarUrl: null,
      role: "admin",
      capabilities: ["user:edit_own"],
    };
    const context = { basePath: "", methods, user: () => user };

    const untouched = renderWithAuthContext(context, () =>
      renderToString(<p>static</p>),
    );
    const read = renderWithAuthContext(context, () =>
      renderToString(<AccountMenu />),
    );

    expect(untouched.session).toBeUndefined();
    expect(read.session).toEqual({ user, isPending: false });
  });
});
