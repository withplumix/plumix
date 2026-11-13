export const STACK_AT = ["tablet", "mobile", "never"] as const;
export type StackAt = (typeof STACK_AT)[number];
export const DEFAULT_STACK_AT: StackAt = "tablet";

export function pickStackAt(raw: unknown): StackAt {
  return typeof raw === "string" &&
    (STACK_AT as readonly string[]).includes(raw)
    ? (raw as StackAt)
    : DEFAULT_STACK_AT;
}
