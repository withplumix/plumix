import type { NewPost, Post, PostStatus } from "../db/schema/posts.js";
import type { User } from "../db/schema/users.js";
import type {
  PostCreateInput,
  PostUpdateInput,
} from "./procedures/post/schemas.js";
import type {
  UserInviteInput,
  UserListInput,
  UserUpdateInput,
} from "./procedures/user/schemas.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:post.list:input": (input: {
      type?: string;
      status?: Post["status"];
      limit: number;
      offset: number;
    }) => typeof input;
    "rpc:post.list:output": (output: readonly Post[]) => readonly Post[];

    "rpc:post.get:input": (input: { id: number }) => typeof input;
    "rpc:post.get:output": (output: Post) => Post;

    "rpc:post.create:input": (input: PostCreateInput) => PostCreateInput;
    "rpc:post.create:output": (output: Post) => Post;

    "rpc:post.update:input": (input: PostUpdateInput) => PostUpdateInput;
    "rpc:post.update:output": (output: Post) => Post;

    "rpc:post.trash:input": (input: { id: number }) => typeof input;
    "rpc:post.trash:output": (output: Post) => Post;

    "rpc:user.list:input": (input: UserListInput) => UserListInput;
    "rpc:user.list:output": (output: readonly User[]) => readonly User[];

    "rpc:user.get:output": (output: User) => User;

    "rpc:user.invite:input": (input: UserInviteInput) => UserInviteInput;
    "rpc:user.invite:output": (output: {
      user: User;
      inviteToken: string;
    }) => typeof output;

    "rpc:user.update:input": (input: UserUpdateInput) => UserUpdateInput;
    "rpc:user.update:output": (output: User) => User;

    "rpc:user.disable:output": (output: User) => User;
    "rpc:user.delete:output": (output: User) => User;

    [K: `${string}:before_save`]: (post: NewPost) => NewPost;
  }

  interface ActionRegistry {
    [K: `${string}:published`]: (post: Post) => void | Promise<void>;
    [K: `${string}:updated`]: (
      post: Post,
      previous: Post,
    ) => void | Promise<void>;
    [K: `${string}:trashed`]: (post: Post) => void | Promise<void>;
    [K: `${string}:transition`]: (
      post: Post,
      oldStatus: PostStatus,
    ) => void | Promise<void>;
  }
}

export {};
