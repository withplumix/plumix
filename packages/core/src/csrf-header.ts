/**
 * The header core's CSRF gate looks for on `/_plumix/*` mutations, and the
 * value it expects.
 *
 * It sits in the foundation layer, apart from the gate in `auth/csrf.ts`,
 * because the senders are islands: a `"use client"` module that reached into
 * `auth/` to name the header would pull the database, the authenticator and
 * the dispatcher into a browser bundle. The gate re-exports it, so the value a
 * request is judged against and the value it was sent with are the same one.
 */
export const CSRF_HEADER_NAME = "X-Plumix-Request";
export const CSRF_HEADER_VALUE = "1";
