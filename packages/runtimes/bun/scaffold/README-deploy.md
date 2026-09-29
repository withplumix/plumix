This project runs on Bun, and every command runs on it: install with Bun, and
start the `plumix` CLI with `bun --bun`, which runs it on Bun rather than on
the Node its bin names. The build writes `dist/client` for the browser and
`dist/server/worker.js` to run; the SQLite database and uploads live under
`data/`, so keep that directory on a persistent disk. `bun run clean` removes it
along with the build output.

```sh
bun install
bun --bun plumix migrate generate
bun --bun plumix migrate apply
bun run build
PORT=3000 bun dist/server/worker.js
```

`bun run dev` starts one Vite server with the site behind it: an edit to the
config, the theme or a plugin is served on the next request. Copy
`.env.example` to `.env` for local secrets; the dev server applies it and
picks up edits, and the built server loads it from the directory it starts
in. Either way a variable the environment already sets wins over the file.
`bunfig.toml` turns Bun's own env loading off, so `.env.local` and
`.env.{NODE_ENV}` are never read.

Behind a TLS-terminating proxy, pass `bun({ trustProxy: true })` in
`plumix.config.ts` and change the passkey `rpId` and `origin` to the host you
deploy on. For several processes sharing uploads, swap `diskStorage` for
`bunS3` from `@plumix/runtime-bun`.
