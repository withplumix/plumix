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
export { appRouter } from "./router.js";
export type { AppRouter } from "./router.js";
