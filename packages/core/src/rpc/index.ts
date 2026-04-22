import "./hooks.js";

export { authenticated } from "./authenticated.js";
export { base } from "./base.js";
export type { Base } from "./base.js";
export { RPC_ERRORS } from "./errors.js";
export { authRouter } from "./procedures/auth/index.js";
export type { AuthRouter } from "./procedures/auth/index.js";
export { authSessionOutputSchema } from "./procedures/auth/schemas.js";
export type {
  AuthSessionOutput,
  AuthSessionUser,
} from "./procedures/auth/schemas.js";
export { emailField, nameField } from "./validation.js";
export {
  applyEntryBeforeSave,
  fireEntryPublished,
  fireEntryTransition,
  fireEntryTrashed,
  fireEntryUpdated,
  entryCapability,
} from "./procedures/entry/lifecycle.js";
export { entryRouter } from "./procedures/entry/index.js";
export type { EntryRouter } from "./procedures/entry/index.js";
export {
  entryCreateInputSchema,
  entryGetInputSchema,
  entryListInputSchema,
  entryTrashInputSchema,
  entryUpdateInputSchema,
} from "./procedures/entry/schemas.js";
export type {
  EntryCreateInput,
  EntryGetInput,
  EntryListInput,
  EntryTrashInput,
  EntryUpdateInput,
} from "./procedures/entry/schemas.js";
export { settingsRouter } from "./procedures/settings/index.js";
export type { SettingsRouter } from "./procedures/settings/index.js";
export {
  settingsGetInputSchema,
  settingsUpsertInputSchema,
} from "./procedures/settings/schemas.js";
export type {
  SettingsGetInput,
  SettingsUpsertInput,
} from "./procedures/settings/schemas.js";
export { termRouter } from "./procedures/term/index.js";
export type { TermRouter } from "./procedures/term/index.js";
export {
  termCreateInputSchema,
  termDeleteInputSchema,
  termGetInputSchema,
  termListInputSchema,
  termUpdateInputSchema,
} from "./procedures/term/schemas.js";
export type {
  TermCreateInput,
  TermDeleteInput,
  TermGetInput,
  TermListInput,
  TermUpdateInput,
} from "./procedures/term/schemas.js";
export { userRouter } from "./procedures/user/index.js";
export type { UserRouter } from "./procedures/user/index.js";
export {
  userDeleteInputSchema,
  userDisableInputSchema,
  userGetInputSchema,
  userInviteInputSchema,
  userListInputSchema,
  userUpdateInputSchema,
} from "./procedures/user/schemas.js";
export type {
  UserDeleteInput,
  UserDisableInput,
  UserGetInput,
  UserInviteInput,
  UserListInput,
  UserUpdateInput,
} from "./procedures/user/schemas.js";
export { appRouter } from "./router.js";
export type { AppRouter, AppRouterClient } from "./router.js";
