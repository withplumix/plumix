import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import { ADMIN_BASE_PATH } from "../lib/constants.js";
import { routeTree } from "../routeTree.gen.js";

// No explicit return type: TS infers the narrow Router<typeof routeTree, ...>
// which gives Link/useNavigate full route-level autocomplete downstream.
export function createRouter() {
  return createTanstackRouter({
    routeTree,
    basepath: ADMIN_BASE_PATH,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
