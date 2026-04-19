import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import { ADMIN_BASE_PATH } from "./constants.js";
import { routeTree } from "./routeTree.gen.js";

export function createRouter(): ReturnType<typeof createTanstackRouter> {
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
