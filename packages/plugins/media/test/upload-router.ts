import { base } from "plumix/plugin";
import * as v from "valibot";

/**
 * The shape a plugin uses when a server step works on the upload itself. Only
 * its type is used, so a browser test never loads the server side.
 */
const _uploadRouter = {
  upload: base
    .input(v.object({ file: v.instance(File) }))
    .handler(({ input }): { size: number } => ({ size: input.file.size })),
  thumbnail: base
    .input(v.object({ id: v.number() }))
    .handler((): { body: Blob } => ({ body: new Blob([]) })),
};

export type UploadRouter = typeof _uploadRouter;
