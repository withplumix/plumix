import { encodeBase64urlNoPadding } from "@oslojs/encoding";

import type { Db } from "../context/app-context.js";
import type { DeviceCode } from "../db/schema/device_codes.js";
import { and, eq } from "../db/index.js";
import { deviceCodes } from "../db/schema/device_codes.js";
import { createApiToken } from "./api-tokens.js";
import { hashToken } from "./tokens.js";

const DEVICE_CODE_BYTES = 32;
/** Humans type this code, so 0/O/1/I are left out. */
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_LENGTH = 8;
const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const DEVICE_CODE_POLL_INTERVAL_SECONDS = 5;

export const DEVICE_FLOW_TTL_SECONDS = DEVICE_CODE_TTL_SECONDS;
export const DEVICE_FLOW_INTERVAL_SECONDS = DEVICE_CODE_POLL_INTERVAL_SECONDS;

interface DeviceCodeRequest {
  /** The client polls with this; never shown to the human. */
  readonly deviceCode: string;
  /** The human types this into the admin to approve. */
  readonly userCode: string;
  readonly expiresIn: number;
  readonly interval: number;
}

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
 * Only a pending row transitions; `false` after a successful lookup means a
 * concurrent approve or deny won. `scopes: null` lets the token inherit the
 * approver's role caps.
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
 * Only a pending row transitions, so deny never revokes an approval. The row
 * stays until exchange so the client sees `access_denied`, not `invalid_grant`.
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
 * Consumes the row on approval, denial or expiry, so a leaked device_code can't
 * be exchanged twice.
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

  // DELETE…RETURNING so two concurrent polls can't both mint a token from one
  // approval; the loser reads "pending".
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
