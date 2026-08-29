/**
 * The header core's CSRF gate looks for on `/_plumix/*` mutations, and the
 * value it expects.
 *
 * It lives here rather than in `@plumix/core` beside the gate that reads it
 * because the senders are islands: a `"use client"` module that reaches for
 * `plumix` to name the header would pull the database, the authenticator and
 * the dispatcher into a browser bundle. `@plumix/blocks` depends on nothing
 * from core — core depends on blocks — so this is the lowest shelf both a
 * server-side gate and a client-side sender can reach. `core/auth/csrf.ts`
 * re-exports it, so the value a request is judged against and the value it
 * was sent with are the same one.
 */
export const CSRF_HEADER_NAME = "X-Plumix-Request";
export const CSRF_HEADER_VALUE = "1";
