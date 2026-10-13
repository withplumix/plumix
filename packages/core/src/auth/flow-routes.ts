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
