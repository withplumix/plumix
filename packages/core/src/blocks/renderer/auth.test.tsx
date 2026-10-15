import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { RendererUser } from "./context.js";
import { createBlockRegistry } from "../block-registry.js";
import { PlumixProvider, SignedIn, SignedOut } from "./index.js";

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
