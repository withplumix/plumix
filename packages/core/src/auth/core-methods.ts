import type { AuthMethodDefinition } from "../plugin/auth-method.js";
import type * as AuthFlowRoutes from "./flow-routes.js";
import type { AuthFlowApp } from "./flow-app.js";
import { defineAuthMethod } from "../plugin/auth-method.js";
import { MAGIC_LINK_ERROR_CODES } from "./magic-link/errors.js";
import { OAUTH_ERROR_CODES } from "./oauth/errors.js";

/** Lazy so declaring the methods loads none of the flow code. */
function flows(): Promise<typeof AuthFlowRoutes> {
  return import("./flow-routes.js");
}

/** Core's sign-in methods, their handlers closing over `app`. */
export function coreAuthMethods(
  app: AuthFlowApp,
): readonly AuthMethodDefinition[] {
  const { auth } = app.config;
  return [
    defineAuthMethod({
      name: "passkey",
      label: "Passkey",
      routes: {
        "register/options": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handlePasskeyRegisterOptions(kernel, app),
        },
        "register/verify": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handlePasskeyRegisterVerify(kernel, app),
        },
        "login/options": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handlePasskeyLoginOptions(kernel, app),
        },
        "login/verify": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handlePasskeyLoginVerify(kernel, app),
        },
      },
    }),
    defineAuthMethod({
      name: "invite",
      label: "Invite",
      listed: false,
      routes: {
        "register/options": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handleInviteRegisterOptions(kernel, app),
        },
        "register/verify": {
          method: "POST",
          handler: async (kernel) =>
            (await flows()).handleInviteRegisterVerify(kernel, app),
        },
      },
    }),
    defineAuthMethod({
      name: "magic-link",
      label: "Magic link",
      listed: auth.magicLink !== undefined,
      errorCodes: MAGIC_LINK_ERROR_CODES,
      routes: {
        request: {
          method: "POST",
          formPost: true,
          handler: async (kernel) =>
            (await flows()).handleMagicLinkRequest(kernel, app),
        },
        verify: {
          method: "GET",
          handler: async (kernel) =>
            (await flows()).handleMagicLinkVerify(kernel, app),
        },
      },
    }),
    defineAuthMethod({
      name: "oauth",
      label: "OAuth",
      listed: Object.keys(auth.oauth?.providers ?? {}).length > 0,
      errorCodes: OAUTH_ERROR_CODES,
      routes: {
        ":provider/start": {
          method: "GET",
          handler: async (kernel) =>
            (await flows()).handleOAuthStart(kernel, app),
        },
        ":provider/callback": {
          method: "GET",
          handler: async (kernel) =>
            (await flows()).handleOAuthCallback(kernel, app),
        },
      },
    }),
  ];
}
