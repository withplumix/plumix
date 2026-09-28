import { base } from "plumix/plugin";
import * as v from "valibot";

// A router that takes the file itself and hands bytes back — the shape a
// plugin reaches for when a server step works on the upload rather than on a
// presigned URL. Media's own uploads go over XHR instead; this is the RPC
// path a plugin author's test takes. Only its type is used, through
// `import type`, so a browser test never loads the server side.
const _uploadRouter = {
  upload: base
    .input(v.object({ file: v.instance(File) }))
    .handler(({ input }): { size: number } => ({ size: input.file.size })),
  thumbnail: base
    .input(v.object({ id: v.number() }))
    .handler((): { body: Blob } => ({ body: new Blob([]) })),
};

export type UploadRouter = typeof _uploadRouter;
