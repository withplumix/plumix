// Shaped like the real declarations: core's `AppContext` is a generic alias over
// an intersection, `PlumixApp` a plain interface.
interface AppContextBase<TSchema> {
  readonly db: TSchema;
  readonly memo: () => void;
}

// Empty like core's, which plugins augment by declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppContextExtensions {}

export type AppContext<TSchema = object> = AppContextBase<TSchema> &
  AppContextExtensions;

export interface PlumixApp {
  readonly scheduledTasks: readonly string[];
}
