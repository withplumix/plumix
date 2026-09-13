import type * as plumix from "./forged-app-records.js";
import type {
  AppContext,
  PlumixApp,
  PlumixApp as RenamedApp,
} from "./forged-app-records.js";

declare const raw: unknown;
declare const loose: any;

type AliasedApp = PlumixApp;

type AliasedContext = AppContext;

type FrozenApp = Readonly<PlumixApp>;

type ExtendedContext = AppContext & { readonly extra: true };

declare function takeApp(app: PlumixApp): void;

declare function takeOptionalApp(app: PlumixApp | undefined): void;

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

// Renaming or wrapping the record does not change what is being forged.
export const forgedRenamed = raw as RenamedApp;

export const forgedAliased = {} as AliasedApp;

export const forgedAliasedContext = {} as AliasedContext;

export const forgedReadonly = raw as Readonly<PlumixApp>;

export const forgedFrozen = raw as FrozenApp;

export const forgedIntersection = {} as PlumixApp & { readonly extra: true };

// `AppContext` is itself an intersection, so extending it flattens the name away.
export const forgedExtendedContext = {} as AppContext & {
  readonly extra: true;
};

export const forgedExtendedAlias = raw as ExtendedContext;

export const forgedOptional = raw as PlumixApp | undefined;

// `never` fits any slot, so it forges whatever record the slot expects.
takeApp({} as never);

takeOptionalApp({} as never);

// A value that already has the record's shape is a widening, not a forgery.
export const shaped = { db: "", memo: () => undefined } as AppContext<string>;

export const shapedAliased = { scheduledTasks: [] } as AliasedApp;

// Only the two app records are ratcheted; other test doubles keep the escape.
export const weight = 42n as unknown as number;

export function sliceOf(ctx: Pick<AppContext, "db">): object {
  return ctx.db;
}
