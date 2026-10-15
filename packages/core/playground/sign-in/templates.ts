import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, forView } from "plumix/theme";

// Extensionless: jiti, which loads the config, maps `.js` to `.ts` only.
import { AccountMenu } from "./account-menu";
import { PlainSignIn } from "./plain-sign-in";
import { SignInForm } from "./sign-in-form";

/** The theme's rule for each view in `pages.ts`. */
export const signInTemplates = [
  forView("sign-in").template((): ReactNode =>
    h("main", null, h(SignInForm, { client: "load" })),
  ),
  forView("sign-in-no-script").template(
    defineTemplate({
      // The template reads the request, for the `?email_code_…` outcome.
      render: ({ ctx }): ReactNode =>
        h("main", null, h(PlainSignIn, { request: ctx.request })),
    }),
  ),
  forView("account").template((): ReactNode =>
    h("main", null, h(AccountMenu, { client: "load" })),
  ),
];
