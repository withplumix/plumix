import { renderTurnstileWidget } from "./turnstile.js";

/**
 * Loading page shown at `/demo` while the sandbox provisions: it POSTs
 * `/_demo/init`, then redirects into the admin. When a Turnstile site key is
 * given, the widget's callback supplies the token and starts init (and its
 * error callbacks fall back to the retry page); otherwise init starts
 * immediately.
 *
 * The Turnstile widget carries its own spinner, so our card spinner is rendered
 * only when there's no widget (local dev / e2e) — a visitor never sees two.
 */
export function renderDemoLoadingPage(siteKey?: string): string {
  const widget = siteKey ? renderTurnstileWidget(siteKey) : "";
  const spinner = siteKey
    ? ""
    : `<div class="pdl-spinner" aria-hidden="true"></div>`;
  const boot = siteKey
    ? "window.plumixDemoTurnstile = startDemo; window.plumixDemoTurnstileError = showError;"
    : "startDemo();";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Starting the demo…</title>
    <style>
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; align-items: center; justify-content: center;
        background: #fbfaf8; color: #1b1a17;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .pdl-card {
        display: flex; flex-direction: column; align-items: center;
        gap: 18px; padding: 32px; text-align: center; max-width: 360px;
      }
      .pdl-spinner {
        width: 34px; height: 34px; border-radius: 50%;
        border: 3px solid #e7e3dc; border-top-color: #b5472d;
        animation: pdl-spin 0.8s linear infinite;
      }
      @keyframes pdl-spin { to { transform: rotate(360deg); } }
      .pdl-title {
        margin: 0; font-size: 22px; font-weight: 600;
        font-family: "Iowan Old Style", Georgia, Cambria, "Times New Roman", serif;
      }
      .pdl-sub { margin: 0; font-size: 14px; line-height: 1.5; color: #6f6b63; }
      .pdl-widget { display: flex; justify-content: center; }
      .pdl-retry {
        display: inline-block; text-decoration: none; margin-top: 4px;
        background: #1b1a17; color: #fbfaf8; font-weight: 600; font-size: 14px;
        padding: 9px 18px; border-radius: 9999px;
      }
    </style>
  </head>
  <body>
    <main class="pdl-card" id="pdl-card">
      ${spinner}
      <h1 class="pdl-title">Setting up your demo…</h1>
      <p class="pdl-sub">This only takes a moment.</p>
      <div class="pdl-widget">${widget}</div>
    </main>
    <script>
      function showError() {
        document.getElementById("pdl-card").innerHTML =
          '<h1 class="pdl-title">Couldn\\'t start the demo</h1>' +
          '<p class="pdl-sub">Something interrupted setup.</p>' +
          '<a class="pdl-retry" href="/demo">Try again</a>';
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
  </body>
</html>
`;
}
