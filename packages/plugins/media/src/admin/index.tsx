// Plugin admin entry. Bundled by the plumix vite plugin into the host's
// admin chunk; module-eval runs once on page load and registers our page
// component into the admin's plugin registry. The path here matches the
// `path` we passed to `ctx.registerAdminPage` server-side so the admin
// router resolves both metadata (nav, capability) and component to the
// same page.

import type { ComponentType } from "react";

import { MediaLibrary } from "./MediaLibrary.js";

declare global {
  interface Window {
    plumix?: {
      readonly registerPluginPage: (
        path: string,
        component: ComponentType,
      ) => void;
    };
  }
}

if (typeof window !== "undefined" && window.plumix) {
  window.plumix.registerPluginPage("/media", MediaLibrary);
}

export { MediaLibrary };
