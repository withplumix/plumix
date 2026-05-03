// Shape-checking helpers for oRPC client errors. The wire form is
// `{ code: "NOT_FOUND" | "CONFLICT" | ..., data?: { reason?: string } }`
// — three identical inline copies were drifting across the admin
// surfaces (users edit, terms edit, profile passkeys); centralise so
// new error-mapping call sites pick the same shape.

export function extractCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

export function extractReason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "data" in err) {
    return (err as { data?: { reason?: string } }).data?.reason;
  }
  return undefined;
}
