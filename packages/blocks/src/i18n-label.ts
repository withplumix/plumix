// Structurally compatible with `@plumix/core/i18n`'s `Label` —
// `@plumix/core` depends on `@plumix/blocks`, not the other way around
// (see `loaders.ts`), so this package can't import from it. Mirrors the
// extractor-visible fields of Lingui's `MessageDescriptor` (id, message,
// comment); plugin authors pass core's `Label` here and TS structural
// typing accepts the assignment.
interface MessageDescriptorLike {
  readonly id: string;
  readonly message?: string;
  readonly comment?: string;
}

export type Label = string | MessageDescriptorLike;
