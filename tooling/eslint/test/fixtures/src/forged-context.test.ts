interface AppContext<TSchema = object> {
  readonly db: TSchema;
}

declare namespace plumix {
  type AppContext = object;
}

export const forged = {} as unknown as AppContext;

export const forgedWithSchema = {} as unknown as AppContext<string>;

export const forgedQualified = {} as unknown as plumix.AppContext;

// Only the context record is ratcheted; other test doubles keep the escape.
export const weight = 42n as unknown as number;

export function sliceOf(ctx: Pick<AppContext, "db">): object {
  return ctx.db;
}
