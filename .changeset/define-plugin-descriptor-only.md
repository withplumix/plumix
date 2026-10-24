---
"plumix": minor
---

Removes the function form of `definePlugin`: a plugin is now always defined with a descriptor, and passing a setup function as the second argument is a type error. Move the function into `setup`, and any third-argument options into the same object:

```ts
// Before
definePlugin("acme", (ctx) => { ... }, { adminEntry: "./admin.tsx" });

// After
definePlugin("acme", {
  setup: (ctx) => { ... },
  adminEntry: "./admin.tsx",
});
```

The `DefinePluginOptions` type is gone from `plumix/plugin`; its fields are on `DefinePluginInput`.
