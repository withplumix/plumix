function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { extendedCode, message } = error as {
    extendedCode?: unknown;
    message?: unknown;
  };
  if (
    extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ||
    extendedCode === "SQLITE_CONSTRAINT_PRIMARYKEY"
  ) {
    return true;
  }
  return (
    typeof message === "string" && message.includes("UNIQUE constraint failed")
  );
}

export function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (isUniqueViolation(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
