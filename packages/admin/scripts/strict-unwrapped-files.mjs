// Shared source of truth for the strict-ratchet denylist. Both
// `eslint.config.ts` (override block) and `ratchet-drift-check.mjs`
// import this so the gate stays one list, not two.
//
// Logic-only helpers — every flagged string is a developer-facing
// console message, DOM event name, or framework config discriminator
// (TanStack `defaultPreload: "intent"`), not user chrome. Adding
// ignore-regex would risk over-suppression of real chrome elsewhere;
// explicit denylist entry is the safer call.
export const STRICT_UNWRAPPED_FILES = [
  "src/lib/errors.ts",
  "src/lib/wait-for-plugin-chunks.ts",
  "src/providers/router.ts",
  "src/providers/theme.tsx",
];
