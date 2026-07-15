import { DEMO_EXPIRES_COOKIE_NAME } from "./session.js";

/** Where "Deploy your own" sends the visitor. */
const DEPLOY_URL = "https://github.com/withplumix/plumix";

/**
 * A floating pill injected into the demo's HTML responses: a "Demo" badge, a
 * live countdown to session expiry, a reset control, and a deploy CTA. Plain
 * HTML + inline styles + a small script — no dependencies. The countdown is
 * client-side: it reads the readable `plumix_demo_expires` cookie (an epoch-ms
 * expiry set alongside the session) rather than any server-rendered time.
 */
export function renderDemoToolbar(): string {
  return `
<div id="plumix-demo-toolbar" style="position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;padding:8px 14px;border-radius:9999px;background:#111;color:#fff;font:500 13px/1 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)">
  <span style="font-weight:700">Demo</span>
  <span id="plumix-demo-time" style="opacity:.8">—</span>
  <a href="/_demo/reset" style="color:#fff;text-decoration:underline;opacity:.9">Reset</a>
  <a href="${DEPLOY_URL}" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;background:#fff2;padding:4px 10px;border-radius:9999px">Deploy your own</a>
</div>
<script>
(function () {
  var el = document.getElementById("plumix-demo-time");
  if (!el) return;
  var m = document.cookie.match(/(?:^|;\\s*)${DEMO_EXPIRES_COOKIE_NAME}=(\\d+)/);
  if (!m) { el.textContent = ""; return; }
  var expires = parseInt(m[1], 10);
  function tick() {
    var left = Math.max(0, expires - Date.now());
    if (left === 0) { el.textContent = "expired"; return; }
    el.textContent = Math.ceil(left / 60000) + "m left";
  }
  tick();
  setInterval(tick, 30000);
})();
</script>`;
}

/** Insert the toolbar just before `</body>`; a no-op on non-HTML documents. */
export function injectDemoToolbar(html: string): string {
  if (!html.includes("</body>")) return html;
  return html.replace("</body>", `${renderDemoToolbar()}</body>`);
}
