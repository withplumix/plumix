---
"@plumix/runtime-bun": minor
---

Adds the Bun runtime's storage slots. `diskStorage({ dir })` keeps uploads on disk through `Bun.file`, each key a file under `dir/objects/` with its content type and metadata beside it under `dir/meta/`; `url()` is null, so media serves through its own route. `bunS3({ bucket, endpoint?, region?, credentials })` keeps them in any S3-compatible bucket over Bun's `S3Client`, with `credentials` as literal keys or an `(env) => credentials` resolver passed to the client explicitly. `put` and `head` go through core's portable signer so custom metadata and the exact content type round-trip, and `presignPut` signs the content type, so a browser upload cannot change it.
