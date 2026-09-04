This project runs as a plain Node.js process. The build writes `dist/client`
for the browser and `dist/server/worker.js` to run; the SQLite database and
uploads live under `data/`, so keep that directory on a persistent disk.
`pnpm clean` removes it along with the build output.

```sh
plumix migrate generate
plumix migrate apply
pnpm build
PORT=3000 node dist/server/worker.js
```

`plumix dev` is not available on Node yet: build and run the server while you
work, and rebuild after a change.

Behind a TLS-terminating proxy, pass `node({ trustProxy: true })` in
`plumix.config.ts` and change the passkey `rpId` and `origin` to the host you
deploy on.
