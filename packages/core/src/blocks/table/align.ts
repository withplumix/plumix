export const ALIGNS = ["left", "center", "right"] as const;
export type Align = (typeof ALIGNS)[number];

export function pickAlign(raw: unknown): Align | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : undefined;
}
