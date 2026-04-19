import "./hooks.js";

export { authenticated } from "./authenticated.js";
export { base } from "./base.js";
export type { Base } from "./base.js";
export { RPC_ERRORS } from "./errors.js";
export {
  applyPostBeforeSave,
  firePostPublished,
  firePostTransition,
  firePostTrashed,
  firePostUpdated,
  postCapability,
} from "./procedures/post/lifecycle.js";
export { postRouter } from "./procedures/post/index.js";
export type { PostRouter } from "./procedures/post/index.js";
export {
  postCreateInputSchema,
  postGetInputSchema,
  postListInputSchema,
  postTrashInputSchema,
  postUpdateInputSchema,
} from "./procedures/post/schemas.js";
export type {
  PostCreateInput,
  PostGetInput,
  PostListInput,
  PostTrashInput,
  PostUpdateInput,
} from "./procedures/post/schemas.js";
export { optionRouter } from "./procedures/option/index.js";
export type { OptionRouter } from "./procedures/option/index.js";
export {
  optionDeleteInputSchema,
  optionGetInputSchema,
  optionListInputSchema,
  optionSetInputSchema,
} from "./procedures/option/schemas.js";
export type {
  OptionDeleteInput,
  OptionGetInput,
  OptionListInput,
  OptionSetInput,
} from "./procedures/option/schemas.js";
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
