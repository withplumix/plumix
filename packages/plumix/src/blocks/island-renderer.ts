// Bridges the islands React renderer chunk into the `plumix` package's
// public exports so consumer apps don't need a direct dep on the
// workspace-internal `@plumix/blocks`. Unlike `island-runtime`, this
// module has no side effect — it only re-exports `mount`, which the
// custom element dynamic-imports on first hydration. It's the target of
// the generated `.plumix/islands-renderer-entry.ts` Rollup input.

export * from "@plumix/blocks/island-renderer";
