import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { RendererAuthMethods, RendererUser } from "./context.js";
import { createBlockRegistry } from "../block-registry.js";
import {
  PlumixProvider,
  SignedIn,
  SignedOut,
  useAuthMethods,
} from "./index.js";

const registry = createBlockRegistry([]);

const user: RendererUser = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  role: "subscriber",
  meta: {},
};

function render(node: React.ReactNode, u: RendererUser | null): string {
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry, user: u }}>{node}</PlumixProvider>,
  );
}

describe("SignedIn", () => {
  test("renders its children when a user is present", () => {
    expect(render(<SignedIn>Hi Ada</SignedIn>, user)).toBe("Hi Ada");
  });

  test("renders nothing when signed out", () => {
    expect(render(<SignedIn>Hi Ada</SignedIn>, null)).toBe("");
  });
});

describe("SignedOut", () => {
  test("renders its children when there is no user", () => {
    expect(render(<SignedOut>Sign in</SignedOut>, null)).toBe("Sign in");
  });

  test("renders nothing when a user is present", () => {
    expect(render(<SignedOut>Sign in</SignedOut>, user)).toBe("");
  });
});

function Methods(): React.ReactNode {
  const m = useAuthMethods();
  if (!m) return <>none</>;
  return (
    <>
      {`ml:${m.magicLink}`}
      {m.oauthProviders.map((p) => (
        <span key={p.key}>{p.label}</span>
      ))}
    </>
  );
}

function renderWith(authMethods?: RendererAuthMethods): string {
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry, authMethods }}>
      <Methods />
    </PlumixProvider>,
  );
}

describe("useAuthMethods", () => {
  test("reports the configured methods for a login page to render from", () => {
    expect(
      renderWith({
        passkey: true,
        magicLink: true,
        oauthProviders: [{ key: "github", label: "GitHub" }],
      }),
    ).toBe("ml:true<span>GitHub</span>");
  });

  test("returns null when the render supplies no methods", () => {
    expect(renderWith()).toBe("none");
  });
});
