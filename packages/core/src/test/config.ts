import type { PlumixAuthInput } from "../auth/config.js";
import type { PlumixConfig, PlumixConfigInput } from "../config.js";
import { auth } from "../auth/config.js";
import { plumix } from "../runtime/define-config.js";
import { defaultTestTheme } from "./default-theme.js";

/**
 * The config slots a test sets, every one optional: the harness supplies the
 * runtime, database, passkey and theme a real config would have to name.
 */
export type TestConfigInput = Partial<Omit<PlumixConfigInput, "auth">> & {
  readonly auth?: Partial<PlumixAuthInput>;
};

const stubAdapter = {
  name: "test",
  handler: {},
  generateEntry: () => "",
};

const stubDatabase = {
  kind: "test",
  connect: () => ({ db: {} }),
};

const testPasskey = {
  rpName: "Plumix Test",
  rpId: "cms.example",
  origin: "https://cms.example",
};

/**
 * Resolve a test's slots through `auth()` and `plumix()`, so every harness
 * hands its context the same config object a deployed app would.
 */
export function testConfig(input: TestConfigInput = {}): PlumixConfig {
  const { auth: authInput, ...slots } = input;
  return plumix({
    ...slots,
    runtime: slots.runtime ?? stubAdapter,
    database: slots.database ?? stubDatabase,
    theme: slots.theme ?? defaultTestTheme,
    auth: auth({ ...authInput, passkey: authInput?.passkey ?? testPasskey }),
  });
}
