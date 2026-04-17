import type { NewPost, Post, PostStatus } from "../db/schema/posts.js";
import type {
  PostCreateInput,
  PostUpdateInput,
} from "./procedures/post/schemas.js";

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
