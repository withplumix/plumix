import { renderTurnstileWidget } from "./turnstile.js";

/**
 * Loading page shown at `/demo` while the sandbox provisions: it POSTs
 * `/_demo/init`, then redirects into the admin. When a Turnstile site key is
 * given, the widget's callback supplies the token and starts init (and its
 * error callbacks fall back to the retry page); otherwise init starts
 * immediately.
 */
export function renderDemoLoadingPage(siteKey?: string): string {
  const widget = siteKey ? renderTurnstileWidget(siteKey) : "";
  const boot = siteKey
    ? "window.plumixDemoTurnstile = startDemo; window.plumixDemoTurnstileError = showError;"
    : "startDemo();";
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
      function showError() {
        document.body.innerHTML =
          '<p>Demo setup failed. <a href="/demo">Try again</a>.</p>';
      }
      function startDemo(token) {
        fetch("/_demo/init", {
          method: "POST",
          headers: token ? { "cf-turnstile-token": token } : {},
        })
          .then((response) => {
            if (!response.ok) throw new Error("init failed");
            location.replace("/_plumix/admin");
          })
          .catch(showError);
      }
      ${boot}
    </script>
    ${widget}
  </body>
</html>
`;
}
