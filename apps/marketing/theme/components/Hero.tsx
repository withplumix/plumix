import type { ReactNode } from "react";

import CONFIG from "../../snippets/plumix.config.ts?raw";
import { LINKS } from "../links";
import { CodePanel } from "./CodePanel";
import { Eyebrow } from "./Eyebrow";
import { InstallCommand } from "./InstallCommand";

export function Hero(): ReactNode {
  return (
    <section data-testid="hero">
      <div className="mx-auto max-w-6xl px-6 pt-12 pb-14 md:pt-20">
        <Eyebrow className="motion-enter">
          Open source · TypeScript · pre-1.0
        </Eyebrow>
        <h1 className="motion-enter mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-tight text-balance [--enter-delay:80ms] md:text-7xl">
          Publishing, <em className="text-accent">typed.</em>
        </h1>
        <p className="motion-enter text-muted mt-6 max-w-2xl text-lg leading-relaxed text-pretty [--enter-delay:160ms] md:text-xl">
          An open-source CMS written in TypeScript. Content types, plugins and
          themes live in your code, and your editors get an admin built from
          them. Runtime adapters mean your site isn't tied to one host.
        </p>

        <div className="motion-enter mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 [--enter-delay:240ms]">
          <InstallCommand />
          <a
            href={LINKS.demo}
            className="text-accent text-sm font-medium hover:underline"
          >
            Try the editor, no sign-up <span aria-hidden="true">→</span>
          </a>
          <a href={LINKS.docs} className="text-muted hover:text-ink text-sm">
            Read the docs
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-24">
        <div className="motion-enter mb-4 flex justify-between [--enter-delay:320ms] lg:grid lg:grid-cols-12">
          <Eyebrow className="lg:col-span-4">01 · You write</Eyebrow>
          <Eyebrow className="lg:col-span-8 lg:col-start-5">
            02 · Your editors get
          </Eyebrow>
        </div>
        {/* The file overlaps the admin it produces, so the pair reads as
            cause and effect. It drops below the sidebar's last link so it
            covers only empty admin chrome. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-12 lg:gap-0">
          <p className="motion-enter text-muted max-w-sm text-base leading-relaxed text-pretty [--enter-delay:320ms] lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:self-start lg:pr-8">
            <span className="text-ink mb-3 block font-serif text-2xl leading-snug">
              One file, one admin.
            </span>
            Each plugin you list adds its screens:{" "}
            <code className="text-ink font-mono text-sm">blog()</code> brings
            Posts, <code className="text-ink font-mono text-sm">pages()</code>{" "}
            brings Pages. Change the list and the admin changes with it.
          </p>
          <figure
            className="motion-enter border-line overflow-hidden rounded-xl border bg-white shadow-[0_30px_60px_-30px_rgba(26,23,20,0.35)] [--enter-delay:400ms] lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:self-start"
            data-testid="admin-screenshot"
          >
            <div className="border-line text-muted flex items-center gap-2 border-b bg-[#faf8f4] px-4 py-2.5 font-mono text-xs">
              <span className="border-line rounded-md border bg-white px-3 py-1">
                localhost:5173/_plumix/admin
              </span>
            </div>
            <img
              src="/screenshots/admin-dashboard.png"
              width={2560}
              height={1600}
              alt="The plumix admin dashboard, listing Pages and Posts with recent activity"
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </figure>
          {/* The snippet lists blog + pages, which is what puts "Posts" and
              "Pages" on the dashboard screenshot. */}
          <CodePanel
            filename="plumix.config.ts"
            source={CONFIG}
            className="motion-enter relative [--enter-delay:640ms] lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:mt-80 lg:mr-6 lg:self-start"
          />
        </div>
      </div>
    </section>
  );
}
