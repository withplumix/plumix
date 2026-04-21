import type { Option } from "../db/schema/options.js";
import type {
  NewPost,
  Post,
  PostStatus,
  PostWithMeta,
} from "../db/schema/posts.js";
import type { Term } from "../db/schema/terms.js";
import type { User } from "../db/schema/users.js";
import type { OptionSetInput } from "./procedures/option/schemas.js";
import type { MetaPatch, PostMetaChanges } from "./procedures/post/meta.js";
import type {
  PostCreateInput,
  PostListInput,
  PostUpdateInput,
} from "./procedures/post/schemas.js";
import type {
  TermCreateInput,
  TermListInput,
  TermUpdateInput,
} from "./procedures/term/schemas.js";
import type {
  UserInviteInput,
  UserListInput,
  UserUpdateInput,
} from "./procedures/user/schemas.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:post.list:input": (input: PostListInput) => PostListInput;
    "rpc:post.list:output": (output: readonly Post[]) => readonly Post[];

    "rpc:post.get:input": (input: { id: number }) => typeof input;
    "rpc:post.get:output": (output: PostWithMeta) => PostWithMeta;

    "rpc:post.create:input": (input: PostCreateInput) => PostCreateInput;
    "rpc:post.create:output": (output: PostWithMeta) => PostWithMeta;

    "rpc:post.update:input": (input: PostUpdateInput) => PostUpdateInput;
    "rpc:post.update:output": (output: PostWithMeta) => PostWithMeta;

    /**
     * Last chance to mutate or short-circuit a meta patch before it hits
     * the DB. Runs after per-key type coercion + `MetaOptions.sanitize`,
     * so the patch values are already normalized. Plugins can:
     *   - reshape `upserts` / `deletes` (e.g. derive one key from another)
     *   - return an empty patch to block the write entirely
     *   - inject meta the caller didn't send
     * Fires on both `post.create` and `post.update`.
     */
    "rpc:post.meta:write": (
      patch: MetaPatch,
      post: { readonly id: number; readonly type: string },
    ) => MetaPatch | Promise<MetaPatch>;

    /**
     * Runs on the decoded meta bag right before `post.get` / `post.create`
     * / `post.update` returns. Plugins can add derived keys, redact
     * secrets, or replace the bag outright. The bag is keyed by the same
     * strings as `metaKeys`; values are typed against each key's
     * `MetaScalarType`.
     */
    "rpc:post.meta:read": (
      meta: Readonly<Record<string, unknown>>,
      post: { readonly id: number; readonly type: string },
    ) =>
      | Readonly<Record<string, unknown>>
      | Promise<Readonly<Record<string, unknown>>>;

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

    "rpc:term.list:input": (input: TermListInput) => TermListInput;
    "rpc:term.list:output": (output: readonly Term[]) => readonly Term[];

    "rpc:term.get:output": (output: Term) => Term;

    "rpc:term.create:input": (input: TermCreateInput) => TermCreateInput;
    "rpc:term.create:output": (output: Term) => Term;

    "rpc:term.update:input": (input: TermUpdateInput) => TermUpdateInput;
    "rpc:term.update:output": (output: Term) => Term;

    "rpc:term.delete:output": (output: Term) => Term;

    "rpc:option.list:output": (output: readonly Option[]) => readonly Option[];
    "rpc:option.get:output": (output: Option) => Option;
    "rpc:option.set:input": (input: OptionSetInput) => OptionSetInput;
    "rpc:option.set:output": (output: Option) => Option;
    "rpc:option.delete:output": (output: Option) => Option;

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

    /**
     * Fires after a successful meta write on any post type. Payload
     * carries the decoded upserts + deleted keys — matches WP's
     * `updated_post_meta` / `deleted_post_meta` / `added_post_meta`
     * collapsed into one action. Named `meta_changed` (not `:updated`)
     * so it doesn't collide with the `${string}:updated` post-row
     * signature above. Plugins that care about a single CPT branch on
     * `post.type` inside the handler.
     */
    "post:meta_changed": (
      post: { readonly id: number; readonly type: string },
      changes: PostMetaChanges,
    ) => void | Promise<void>;

    /**
     * Fires after `user.invite` persists the pending user + token. Main
     * consumer is an email-delivery plugin composing the invite link
     * from `inviteToken`. Payload matches WP's `user_register` plus
     * invite-specific fields — plugins listening on both `user:invited`
     * and `user:registered` can tell "invite sent" from "invite taken".
     *
     * SECURITY: `inviteToken` is the raw plaintext (the DB stores only a
     * hash). Treat it as a credential — do NOT log it, persist it
     * outside the consuming plugin's scope, or forward it to analytics /
     * error-tracking services. A leaked token grants anyone the ability
     * to complete registration as the invited user until it's consumed
     * or expires (7 days).
     */
    "user:invited": (
      user: User,
      context: {
        readonly inviteToken: string;
        readonly invitedBy: number;
        readonly expiresAt: Date;
      },
    ) => void | Promise<void>;

    /**
     * Fires after a user completes invite acceptance (passkey persisted,
     * invite token consumed, session created). Parallel to WordPress's
     * `user_register` when the user comes online for the first time.
     * Use this (not `user:invited`) for onboarding flows like welcome
     * emails or default-content seeding.
     */
    "user:registered": (user: User) => void | Promise<void>;
  }
}

export {};
