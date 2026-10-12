import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../../context/app-context.js";
import type { DevRuntime } from "../../context/dev-runtime.js";
import type { MailCatalogs } from "../../mail/catalogs.js";
import type { DeclaredMails } from "../../mail/declared.js";
import type { PreviewedMail } from "./gallery.js";
import { findEnabledLocale } from "../../i18n/locale-registry.js";
import { mailSite, renderDeclaredMail } from "../../mail/sender.js";
import {
  jsonResponse,
  methodNotAllowed,
  notFound,
} from "../../runtime/contract/http.js";
import { MailGallery } from "./gallery.js";
import { DEBUG_MAIL_PATH } from "./path.js";

/** What the app declared, which the gallery renders. */
interface DebugMailSources {
  readonly mails: DeclaredMails;
  readonly catalogs: MailCatalogs;
}

/**
 * Mount only under the `PLUMIX_DEV` gate, so the routes and this module are
 * absent from production builds.
 */
export async function handleDebugMail(
  ctx: AppContext,
  dev: DevRuntime,
  sources: DebugMailSources,
): Promise<Response> {
  // The dispatcher strips any base-path prefix before routing.
  const url = new URL(ctx.request.url);
  const rest = url.pathname.slice(DEBUG_MAIL_PATH.length);
  if (rest === "/sent") return sentMail(ctx, dev);
  if (rest !== "" && rest !== "/") return notFound("debug-mail-not-found");
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }
  return galleryPage(ctx, dev, sources, url.searchParams.get("locale"));
}

async function galleryPage(
  ctx: AppContext,
  dev: DevRuntime,
  sources: DebugMailSources,
  requested: string | null,
): Promise<Response> {
  const { i18n } = ctx.config;
  const locale =
    (requested === null ? null : findEnabledLocale(i18n, requested)) ??
    i18n.defaultLocale;
  const site = mailSite(
    ctx.config.auth.magicLink?.siteName,
    ctx.origin,
    ctx.config.basePath,
  );
  // Declaration order puts core's mails first, then each plugin's.
  const groups = new Map<string, PreviewedMail[]>();
  for (const [name, declared] of sources.mails) {
    const rendered = await renderDeclaredMail({
      mail: declared.mail,
      props: declared.mail.preview,
      locale: locale.code,
      catalogs: sources.catalogs,
      ...site,
    });
    const owned = groups.get(declared.owner) ?? [];
    owned.push({ name, ...rendered });
    groups.set(declared.owner, owned);
  }
  const page = renderToStaticMarkup(
    <MailGallery
      groups={[...groups].map(([owner, mails]) => ({ owner, mails }))}
      locales={i18n.locales.filter((option) => option.enabled)}
      locale={locale}
      caught={dev.mail.get()}
    />,
  );
  return new Response(`<!doctype html>${page}`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sentMail(ctx: AppContext, dev: DevRuntime): Response {
  const { method } = ctx.request;
  if (method === "GET" || method === "HEAD") {
    return jsonResponse(dev.mail.get());
  }
  if (method === "DELETE") {
    dev.mail.clear();
    return new Response(null, { status: 204 });
  }
  return methodNotAllowed(["GET", "HEAD", "DELETE"]);
}
