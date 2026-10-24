import { definePlugin } from "plumix/plugin";

/**
 * The sign-in samples' pages. Each is a view, so it differs per visitor and
 * the CDN never stores it.
 */
export const signInPages = definePlugin("core-playground-sign-in", {
  setup: (setup) => {
    setup.registerView("sign-in", {
      routes: ["/sign-in"],
      resolve: () => ({ data: null, title: "Sign in" }),
    });
    setup.registerView("sign-in-no-script", {
      routes: ["/sign-in-no-script"],
      resolve: () => ({ data: null, title: "Sign in" }),
    });
    setup.registerView("account", {
      routes: ["/account"],
      resolve: () => ({ data: null, title: "Your account" }),
    });
  },
});
