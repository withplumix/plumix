import * as v from "valibot";

/** The `auth.session` RPC's user, cut to what the session exposes. */
const sessionUserSchema = v.object({
  id: v.number(),
  email: v.string(),
  name: v.nullable(v.string()),
  role: v.string(),
});

export type SessionUser = Readonly<v.InferOutput<typeof sessionUserSchema>>;

/** The `auth.session` RPC's raw envelope. */
export const sessionEnvelopeSchema = v.object({
  json: v.object({ user: v.nullable(sessionUserSchema) }),
});

export interface Session {
  /** `null` when signed out, or while pending. */
  readonly user: SessionUser | null;
  /** True until the session is known. */
  readonly isPending: boolean;
}

export const PENDING: Session = { user: null, isPending: true };

export interface SessionStore {
  readonly read: () => Session;
  /** Loads the session on the first subscribe while it is pending. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly refresh: () => Promise<void>;
}

export function createSessionStore(
  load: () => Promise<SessionUser | null>,
  seed: () => Session,
): SessionStore {
  let current: Session | null = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const read = (): Session => (current ??= seed());

  async function refresh(): Promise<void> {
    const user = await load().catch(() => null);
    current = { user, isPending: false };
    for (const listener of listeners) listener();
  }

  return {
    read,
    subscribe(listener) {
      listeners.add(listener);
      if (read().isPending) loading ??= refresh();
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
  };
}
