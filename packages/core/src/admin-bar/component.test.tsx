import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AuthNamespace } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { PlumixAdminBar } from "./component.js";
import { registerCoreAdminBarContributors } from "./core-contributors.js";

const emptyRegistry = createBlockRegistry([]);

const user = {
  id: 7,
  email: "editor@cms.example",
  role: "editor",
  meta: {},
};

const request = new Request("https://cms.example/");
const auth: AuthNamespace = { can: () => true };
const entryTypes = new Map();

describe("PlumixAdminBar", () => {
  test("renders nothing when user is null", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: null }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toBe("");
  });

  test("renders the bar shell when user is populated", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar"');
  });

  test("right-anchors the account node via a dedicated class + margin-inline-start rule", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    // Account <li> carries the right-anchor class.
    expect(html).toMatch(
      /<li[^>]*data-testid="plumix-admin-bar-node-account"[^>]*class="[^"]*plumix-admin-bar__end/,
    );
    // CSS for that class pushes it to the row's end.
    expect(html).toMatch(
      /\.plumix-admin-bar__end[^{]*\{[^}]*margin-inline-start:\s*auto/,
    );
  });

  test("emits the inline CSS style block once and applies the .plumix-admin-bar class", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-style"');
    expect(html).toContain(".plumix-admin-bar");
    expect(html).toContain('class="plumix-admin-bar"');
    expect(html).toContain("system-ui");
    expect(html).toContain("Noto Sans Arabic");
    expect(html).toContain("Noto Sans SC");
    expect(html).toMatch(/@media\s*\(max-width:\s*639px\)/);
    expect(html).toMatch(/text-overflow:\s*ellipsis/);
  });

  test("renders nav with the localized aria-label", () => {
    const hooks = new HookRegistry();

    const enHtml = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );
    expect(enHtml).toContain('aria-label="Admin"');

    const deUser = { ...user, meta: { locale: "de" } };
    const deHtml = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: deUser }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="Meine Seite"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );
    expect(deHtml).toContain('aria-label="Administration"');
  });

  test("translates chrome strings to Ukrainian when user locale is uk (Cyrillic snapshot)", () => {
    const ukUser = { ...user, meta: { locale: "uk" } };
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);
    const types = new Map([["post", { name: "post", label: "Post" } as never]]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: ukUser }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="Мій сайт"
          auth={auth}
          entryTypes={types}
          queriedEntryDetails={{ type: "post", authorId: 7 }}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('lang="uk"');
    expect(html).toContain('aria-label="Адміністрування"');
    expect(html).toContain("+ Новий");
    expect(html).toContain('aria-label="Створити"');
    expect(html).toContain("Мій сайт");
  });

  test("translates chrome strings to Simplified Chinese when user locale is zh-CN", () => {
    const zhUser = { ...user, meta: { locale: "zh-CN" } };
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);
    const types = new Map([["post", { name: "post", label: "Post" } as never]]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: zhUser }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="我的站点"
          auth={auth}
          entryTypes={types}
          queriedEntryDetails={{ type: "post", authorId: 7 }}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('aria-label="管理"');
    expect(html).toContain("+ 新建");
    expect(html).toContain('aria-label="新建内容"');
    expect(html).toContain("我的站点");
  });

  test("applies dir='rtl' and lang='ar' when the user locale is Arabic", () => {
    const arUser = { ...user, meta: { locale: "ar" } };
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: arUser }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="موقعي"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('aria-label="الإدارة"');
    // Site name passed in is Arabic — localized chrome surrounds it.
    expect(html).toContain("موقعي");
  });

  test("wraps the user's account email in <bdi> so RTL chrome doesn't flip it", () => {
    const arUser = { ...user, meta: { locale: "ar" } };
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: arUser }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="موقعي"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<bdi>editor@cms.example</bdi>");
  });

  test("emits a localized +New summary aria-label for screen readers", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);
    const types = new Map([["post", { name: "post", label: "Post" } as never]]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={types}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('aria-label="Create new"');
  });

  test("renders the +new group as a <details>/<summary> with one child per entry type", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);
    const types = new Map([
      ["post", { name: "post", label: "Post" } as never],
      ["page", { name: "page", label: "Page" } as never],
    ]);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={types}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<details>");
    expect(html).toContain("+ New");
    expect(html).toContain('data-testid="plumix-admin-bar-node-+new:post"');
    expect(html).toContain('data-testid="plumix-admin-bar-node-+new:page"');
    expect(html).toContain('href="/_plumix/admin/entries/posts/create"');
    expect(html).toContain('href="/_plumix/admin/entries/pages/create"');
  });

  test("renders the account as a dropdown with a Profile link and a Sign out button", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain(
      'data-testid="plumix-admin-bar-node-account:profile"',
    );
    expect(html).toContain('href="/_plumix/admin/profile"');
    expect(html).toContain(
      'data-testid="plumix-admin-bar-node-account:signout"',
    );
    // Sign out is a button (needs the CSRF header), not a navigation link.
    expect(html).toMatch(/<button[^>]*data-plumix-signout/);
  });

  test("emits the inline sign-out island targeting the signout endpoint with the CSRF header", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-signout-script"');
    expect(html).toContain("/_plumix/auth/signout");
    expect(html).toContain("X-Plumix-Request");
  });

  test("renders an avatar initial for the mobile account collapse", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    // editor@cms.example → "E"
    expect(html).toMatch(
      /class="plumix-admin-bar__avatar"[^>]*aria-hidden[^>]*>E</,
    );
  });

  test("shows the display name and derives the avatar initial from it", () => {
    const named = { ...user, name: "Alex Rivera" };
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: named }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain("<bdi>Alex Rivera</bdi>");
    expect(html).toMatch(
      /class="plumix-admin-bar__avatar"[^>]*aria-hidden[^>]*>A</,
    );
  });

  test("keeps the bar visible on small screens (never sets the bar to display:none)", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).not.toMatch(/\.plumix-admin-bar\s*\{[^}]*display:\s*none/);
    // It grows for touch instead of disappearing.
    expect(html).toMatch(/@media\s*\(max-width:\s*639px\)/);
    expect(html).toContain("height: 46px");
  });

  test("renders core contributor nodes as anchors with stable testids", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
          entryTypes={entryTypes}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-node-site"');
    expect(html).toContain('href="/_plumix/admin"');
    expect(html).toContain("My Site");
    expect(html).toContain('data-testid="plumix-admin-bar-node-account"');
    expect(html).toContain("editor@cms.example");
  });
});
