"use client";

import type { ReactNode } from "react";
import { createElement as h } from "react";
import { useAuth } from "plumix/blocks/renderer";

/** Shows what `useAuth` resolved: the visitor's email, or signed out. */
export function UseAuthProbe(): ReactNode {
  const { user, loading } = useAuth();
  const state = loading ? "loading" : (user?.email ?? "signed out");
  return h("div", { "data-testid": "use-auth-probe" }, state);
}
