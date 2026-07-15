/**
 * Minimal loading page shown at `/demo` while the sandbox provisions. It POSTs
 * `/_demo/init`, then redirects into the admin. The richer toolbar/loading UI
 * is a later slice; this is the functional minimum.
 */
export function renderDemoLoadingPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Starting the demo…</title>
  </head>
  <body>
    <p>Setting up your demo…</p>
    <script>
      fetch("/_demo/init", { method: "POST" })
        .then((response) => {
          if (!response.ok) throw new Error("init failed");
          location.replace("/_plumix/admin");
        })
        .catch(() => {
          document.body.innerHTML =
            '<p>Demo setup failed. <a href="/demo">Try again</a>.</p>';
        });
    </script>
  </body>
</html>
`;
}
