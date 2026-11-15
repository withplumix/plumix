// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an augmentation target
export interface PlumixEnv {}

export type BindingName<T> = {
  [K in keyof PlumixEnv]: PlumixEnv[K] extends T ? K : never;
}[keyof PlumixEnv];
