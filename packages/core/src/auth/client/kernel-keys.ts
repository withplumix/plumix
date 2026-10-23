/**
 * The auth client's own keys (ADR 0050). No sign-in method may declare a name
 * whose client half would register under one, or the kernel would shadow it.
 */
export const AUTH_CLIENT_KERNEL_KEYS = [
  "account",
  "sessions",
  "can",
  "useAccount",
  "useCan",
  "signIn",
  "signOut",
  "useSession",
  "useAuthMethods",
  "url",
] as const;

export type AuthClientKernelKey = (typeof AUTH_CLIENT_KERNEL_KEYS)[number];

/** `magic-link` → `magicLink`. */
export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}
