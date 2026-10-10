// Outside `auth/` because the senders are islands: naming it from `auth/` would
// pull the database and dispatcher into a browser bundle.
export const CSRF_HEADER_NAME = "X-Plumix-Request";
export const CSRF_HEADER_VALUE = "1";
