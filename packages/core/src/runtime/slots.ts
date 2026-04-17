export interface DatabaseAdapter<TSchema = Record<string, unknown>> {
  readonly kind: string;
  connect(
    env: unknown,
    request: Request,
    schema: TSchema,
  ): {
    db: unknown;
    commit: () => Record<string, string> | null;
  };
}

export interface ObjectStorage {
  readonly kind: string;
}

export interface KV {
  readonly kind: string;
}
