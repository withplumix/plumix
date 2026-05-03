import { encodeBase64urlNoPadding } from "@oslojs/encoding";

import type { Db } from "../context/app.js";
import type { DeviceCode } from "../db/schema/device_codes.js";
import { and, eq } from "../db/index.js";
import { deviceCodes } from "../db/schema/device_codes.js";
import { createApiToken } from "./api-tokens.js";
import { hashToken } from "./tokens.js";

// OAuth 2.0 Device Authorization Grant — RFC 8628. Used by CLIs / MCP
// servers / anything without a browser to bootstrap an API token via
// the operator's existing browser session. Two secrets per flow:
//
//   device_code (high-entropy, machine-side) — what the client polls
//                with; never shown to the human, never typed.
//   user_code   (low-entropy, human-readable) — what the human types
//                into the admin's `/auth/device` page to approve.
//
// Persistence (see `db/schema/device_codes.ts` for the full rationale):
//   row.id        = SHA-256(device_code)         (PK)
//   row.userCode  = "ABCD-EFGH"                  (unique, plaintext)
//   row.userId    = null until approved
//   row.status    = "pending" | "approved" | "denied"
//   row.tokenName = approver-set token label
//   row.scopes    = capability whitelist or null (inherit)
//   row.expiresAt = now + 10min                  (RFC 8628 §3.5)
//
// Polling intervals follow the spec defaults:
//   client polls every `interval` seconds (5).
//   pre-approval: returns "authorization_pending" / "slow_down".
//   post-approval: returns the API token, then deletes the device row.
//   post-deny: returns "access_denied", deletes the row.
//   post-expiry: returns "expired_token".

const DEVICE_CODE_BYTES = 32;
// Base32 alphabet, ambiguous-char-stripped: 0/O/1/I removed. 8 chars
// in two groups of 4 ("ABCD-EFGH") gives 30 bits — enough that brute
// force across the 10-minute TTL is infeasible without distinguishing
// the device_code (~2^-19 odds per attempt with rate-limiting).
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_LENGTH = 8;
const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const DEVICE_CODE_POLL_INTERVAL_SECONDS = 5;

export const DEVICE_FLOW_TTL_SECONDS = DEVICE_CODE_TTL_SECONDS;
export const DEVICE_FLOW_INTERVAL_SECONDS = DEVICE_CODE_POLL_INTERVAL_SECONDS;

interface DeviceCodeRequest {
  /** What the client polls with. ~256 bits of entropy. */
  readonly deviceCode: string;
  /** What the human types into the admin to approve. ~30 bits. */
  readonly userCode: string;
  readonly expiresIn: number;
  readonly interval: number;
}

/**
 * Begin a device-flow session. The caller (raw route handler) returns
 * the response shape directly to the client; this function only
 * persists the DB row.
 */
export async function requestDeviceCode(db: Db): Promise<DeviceCodeRequest> {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const id = await hashToken(deviceCode);
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

  await db.insert(deviceCodes).values({
    id,
    userCode,
    expiresAt,
  });

  return {
    deviceCode,
    userCode,
    expiresIn: DEVICE_CODE_TTL_SECONDS,
    interval: DEVICE_CODE_POLL_INTERVAL_SECONDS,
  };
}

export type LookupUserCodeResult =
  | { readonly outcome: "ok"; readonly id: string; readonly row: DeviceCode }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "expired" }
  | { readonly outcome: "already_approved" }
  | { readonly outcome: "already_denied" };

/**
 * Find the device-code row matching a `user_code` typed by the
 * authenticated browser user. Used by the admin's approval page —
 * the user navigates to `/_plumix/admin/auth/device`, types their
 * code, and the page calls this to render the confirm/deny prompt.
 */
export async function lookupDeviceCodeByUserCode(
  db: Db,
  userCode: string,
): Promise<LookupUserCodeResult> {
  const row = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode))
    .get();
  if (!row) return { outcome: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) {
    return { outcome: "expired" };
  }
  if (row.status === "approved") return { outcome: "already_approved" };
  if (row.status === "denied") return { outcome: "already_denied" };
  return { outcome: "ok", id: row.id, row };
}

/**
 * Approve a pending device-code row. Idempotent — the WHERE clause
 * pins `status = pending` so two concurrent approves race on the
 * primitive itself: the first transitions, the second updates zero
 * rows and returns false. Same guard prevents `denied → approved`
 * (a deny followed by a stale approve is a no-op) and re-approval
 * after exchange (the row is gone).
 *
 * `scopes` may be null to let the minted token inherit the approver's
 * full role caps; non-null narrows the token to that intersection.
 *
 * Returns true when a row transitioned, false when none did. Callers
 * pre-check via `lookupDeviceCodeByUserCode` to surface the specific
 * outcome (expired vs already_approved vs already_denied vs
 * not_found); a `false` here despite a successful prior lookup means
 * a concurrent approve/deny landed first.
 */
export async function approveDeviceCode(
  db: Db,
  input: {
    id: string;
    userId: number;
    tokenName?: string;
    scopes?: readonly string[] | null;
  },
): Promise<boolean> {
  const result = await db
    .update(deviceCodes)
    .set({
      userId: input.userId,
      status: "approved",
      ...(input.tokenName !== undefined ? { tokenName: input.tokenName } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
    })
    .where(and(eq(deviceCodes.id, input.id), eq(deviceCodes.status, "pending")))
    .returning({ id: deviceCodes.id });
  return result.length > 0;
}

/**
 * Deny a pending device-code row. Same `status = pending` guard as
 * `approveDeviceCode` — a deny on an already-approved row is a
 * no-op (we don't revoke an active approval via deny), and a
 * second-tab deny after the first deny lands is silently a no-op.
 *
 * The polling client gets `access_denied` on its next exchange and
 * stops polling. The row is preserved (not deleted) until exchange
 * so the polling client sees the deny outcome rather than a generic
 * `invalid_grant` — exchange consumes denied rows the same way it
 * consumes approved ones.
 */
export async function denyDeviceCode(
  db: Db,
  input: { id: string },
): Promise<boolean> {
  const result = await db
    .update(deviceCodes)
    .set({ status: "denied" })
    .where(and(eq(deviceCodes.id, input.id), eq(deviceCodes.status, "pending")))
    .returning({ id: deviceCodes.id });
  return result.length > 0;
}

type ExchangeDeviceCodeResult =
  | {
      readonly outcome: "approved";
      readonly secret: string;
      readonly userId: number;
    }
  | { readonly outcome: "pending" }
  | { readonly outcome: "denied" }
  | { readonly outcome: "expired" }
  | { readonly outcome: "invalid" };

/**
 * Polled by the client. Returns the freshly-minted API token once a
 * browser-side approval has set the row's `status`; the device-code
 * row is consumed on success/deny/expiry so a leaked device_code
 * can't be exchanged twice.
 *
 * Concurrency: the consume-then-mint path is `DELETE … RETURNING`,
 * not `SELECT` then `DELETE` then `INSERT`. Two concurrent polls of
 * the same approved row cannot both proceed — the second `DELETE`
 * affects zero rows and returns `pending` (the row is gone, but the
 * surface contract is "the human approved, your CLI got the token
 * via the other poll" → effectively the protocol's success path
 * from the *user's* perspective; the polling client sees `pending`
 * once and `invalid_grant` thereafter, both terminal).
 *
 * Pending rows fall through with no DB write. A leaked device_code
 * polling against a still-pending row burns one read per poll but
 * can't race itself into a token.
 */
export async function exchangeDeviceCode(
  db: Db,
  rawDeviceCode: string,
  defaultTokenName: string,
): Promise<ExchangeDeviceCodeResult> {
  const id = await hashToken(rawDeviceCode);
  const row = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.id, id))
    .get();

  if (!row) return { outcome: "invalid" };
  if (row.expiresAt.getTime() < Date.now()) {
    // Reap eagerly so the row doesn't sit until the prune pass.
    await db.delete(deviceCodes).where(eq(deviceCodes.id, id));
    return { outcome: "expired" };
  }
  if (row.status === "denied") {
    // Consume on first poll so a leaked device_code can't keep
    // discovering "user denied this" past the click.
    await db.delete(deviceCodes).where(eq(deviceCodes.id, id));
    return { outcome: "denied" };
  }
  if (row.status !== "approved" || row.userId === null) {
    return { outcome: "pending" };
  }

  // Atomic consume: only the first concurrent poll on an approved
  // row gets back the row. The second sees zero rows from
  // DELETE…RETURNING and resolves to "pending" (which the polling
  // client treats as continue-polling; the next poll sees no row at
  // all and gets "invalid"). Without this, two concurrent polls
  // could both mint a token from one approval.
  const consumed = await db
    .delete(deviceCodes)
    .where(and(eq(deviceCodes.id, id), eq(deviceCodes.status, "approved")))
    .returning({
      userId: deviceCodes.userId,
      tokenName: deviceCodes.tokenName,
      scopes: deviceCodes.scopes,
    });
  const winner = consumed[0];
  if (winner?.userId == null) return { outcome: "pending" };

  const minted = await createApiToken(db, {
    userId: winner.userId,
    name: winner.tokenName ?? defaultTokenName,
    expiresAt: null,
    scopes: winner.scopes ?? null,
  });

  return {
    outcome: "approved",
    secret: minted.secret,
    userId: winner.userId,
  };
}

function generateDeviceCode(): string {
  const bytes = new Uint8Array(DEVICE_CODE_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

function generateUserCode(): string {
  const bytes = new Uint8Array(USER_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) {
    raw += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
