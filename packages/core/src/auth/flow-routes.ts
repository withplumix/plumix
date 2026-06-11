/**
 * Aggregates every auth-flow route handler (passkey, invite, magic-link,
 * device-flow, OAuth, email-change) into one chunk the dispatcher loads via a
 * single memoized dynamic import — see `loadAuthFlowRoutes` for why.
 *
 * `parseOAuthPath` is deliberately NOT re-exported here: the dispatcher matches
 * OAuth paths eagerly from `./oauth/match.js`, and re-exporting it would drag
 * the heavy handler graph back onto the eager path.
 */
export {
  handleInviteRegisterOptions,
  handleInviteRegisterVerify,
  handlePasskeyLoginOptions,
  handlePasskeyLoginVerify,
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
  handleSignout,
} from "./passkey/routes.js";
export {
  handleMagicLinkRequest,
  handleMagicLinkVerify,
} from "./magic-link/routes.js";
export {
  handleDeviceCodeRequest,
  handleDeviceTokenExchange,
} from "./device-flow-routes.js";
export { handleOAuthCallback, handleOAuthStart } from "./oauth/routes.js";
export { handleEmailChangeVerify } from "./email-change/routes.js";
