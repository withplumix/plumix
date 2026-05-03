// Public magic-link surface. Mirrors the OAuth barrel: errors + route
// handlers leave the package; the request/verify implementations are
// internal (the dispatcher imports them by file path).

export { MAGIC_LINK_ERROR_CODES, MagicLinkError } from "./errors.js";
export type { MagicLinkErrorCode } from "./errors.js";

export { handleMagicLinkRequest, handleMagicLinkVerify } from "./routes.js";
