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
<style>
  #plumix-demo-toolbar {
    position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%); z-index: 2147483647; box-sizing: border-box;
    max-width: calc(100vw - 24px);
    display: flex; align-items: center; gap: 10px;
    padding: 7px 7px 7px 16px; border-radius: 9999px;
    background: #111827; color: #fff; white-space: nowrap;
    font: 500 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
  }
  #plumix-demo-toolbar .pdt-brand { font-weight: 700; }
  #plumix-demo-toolbar .pdt-time { opacity: 0.7; font-variant-numeric: tabular-nums; }
  #plumix-demo-toolbar .pdt-sep { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.18); }
  #plumix-demo-toolbar a { color: #fff; }
  #plumix-demo-toolbar .pdt-reset {
    text-decoration: none; opacity: 0.8; padding: 6px 8px; border-radius: 8px;
  }
  #plumix-demo-toolbar .pdt-reset:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); }
  #plumix-demo-toolbar .pdt-deploy {
    text-decoration: none; background: #fff; color: #111827; font-weight: 600;
    padding: 7px 14px; border-radius: 9999px;
  }
  #plumix-demo-toolbar .pdt-deploy-short { display: none; }
  @media (max-width: 420px) {
    #plumix-demo-toolbar { gap: 8px; padding: 6px 6px 6px 13px; font-size: 12px; }
    #plumix-demo-toolbar .pdt-deploy { padding: 6px 12px; }
    #plumix-demo-toolbar .pdt-deploy-full { display: none; }
    #plumix-demo-toolbar .pdt-deploy-short { display: inline; }
  }
</style>
<div id="plumix-demo-toolbar" role="region" aria-label="Plumix demo">
  <span class="pdt-brand">Demo</span>
  <span class="pdt-time" id="plumix-demo-time">—</span>
  <span class="pdt-sep"></span>
  <a class="pdt-reset" href="/_demo/reset">Reset</a>
  <a class="pdt-deploy" href="${DEPLOY_URL}" target="_blank" rel="noopener"
    ><span class="pdt-deploy-full">Deploy your own</span
    ><span class="pdt-deploy-short">Deploy</span></a
  >
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
