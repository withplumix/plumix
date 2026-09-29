---
"plumix": minor
---

Adds the image rules every self-hosted runtime's `/_plumix/image` applies to `plumix/runtime`: `parseImageParams` reads a transform query, snapping its width up the roster (`snapWidth`) and clamping its quality (`clampQuality`); `imageTransformUrl` is the matching `url()` math; `negotiateImageFormat` picks a format from `Accept` among the formats the host can encode; `imageSourceKey` names the source a purge drops; and `fetchRemoteImageSource` fetches a remote source that matches `remotePatterns`, re-checking every redirect and refusing after 10. They use Web APIs only, and the Node runtime's `images()` now runs on them with unchanged behaviour.
