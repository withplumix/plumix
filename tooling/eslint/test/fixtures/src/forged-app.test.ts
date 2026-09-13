interface AppContext<TSchema = object> {
  readonly db: TSchema;
  readonly memo: () => void;
}

interface PlumixApp {
  readonly scheduledTasks: readonly string[];
}

declare namespace plumix {
  type AppContext = object;
  type PlumixApp = object;
}

declare const raw: unknown;
declare const loose: any;

export const forged = {} as unknown as AppContext;

export const forgedWithSchema = {} as unknown as AppContext<string>;

export const forgedQualified = {} as unknown as plumix.AppContext;

export const forgedApp = {} as unknown as PlumixApp;

export const forgedQualifiedApp = raw as plumix.PlumixApp;

// One assertion is enough when the value arrives untyped.
export const forgedFromUnknown = raw as PlumixApp;

export const forgedFromAny = loose as AppContext;

// Or when it carries only some of the record's fields.
export const forgedPartial = { db: "" } as AppContext<string>;

export const forgedEmpty = {} as PlumixApp;

// A value that already has the record's shape is a widening, not a forgery.
export const shaped = { db: "", memo: () => undefined } as AppContext<string>;

// Only the two app records are ratcheted; other test doubles keep the escape.
export const weight = 42n as unknown as number;

export function sliceOf(ctx: Pick<AppContext, "db">): object {
  return ctx.db;
}
