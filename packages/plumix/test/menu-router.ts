import * as v from "valibot";

import { base } from "@plumix/core";

// The shape a plugin's server module hands `registerRpcRouter`. Only its type
// is under test: the handlers never run, the stub answers at the fetch
// boundary. The suites take it with `import type`, so a browser test never
// loads core's root.
const _menuRouter = {
  list: base
    .input(v.object({ termId: v.number() }))
    .handler((): readonly { id: number; name: string }[] => []),
  delete: base
    .input(v.object({ id: v.number() }))
    .handler(({ input }): { id: number } => ({ id: input.id })),
  save: base.input(v.object({})).handler((): { version: number } => ({
    version: 1,
  })),
  locations: {
    list: base.handler((): readonly { id: string }[] => []),
  },
  sync: base
    .input(v.object({ since: v.date() }))
    .handler((): { at: Date } => ({ at: new Date() })),
  upload: base
    .input(v.object({ file: v.instance(File), name: v.string() }))
    .handler((): { size: number } => ({ size: 0 })),
  thumbnail: base
    .input(v.object({ id: v.number() }))
    .handler((): { body: Blob } => ({ body: new Blob([]) })),
  rows: base.input(v.object({ termId: v.number() })).handler(
    (): readonly {
      id: number;
      seenAt: Date;
      tags: ReadonlySet<string>;
    }[] => [],
  ),
};

export type MenuRouter = typeof _menuRouter;
