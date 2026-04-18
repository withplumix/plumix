import type { PasskeyConfig } from "./passkey/config.js";
import type { SessionPolicy } from "./sessions.js";

export interface PlumixAuthInput {
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
}

export interface PlumixAuthConfig {
  readonly kind: "plumix";
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
}

export function auth(input: PlumixAuthInput): PlumixAuthConfig {
  return {
    kind: "plumix",
    passkey: input.passkey,
    sessions: input.sessions,
  };
}
