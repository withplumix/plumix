import type { ReactElement, ReactNode } from "react";
import { Puck } from "@puckeditor/core";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";

interface PlumixEditorLayoutProps {
  readonly children?: ReactNode;
}

export function PlumixEditorLayout(
  _props: PlumixEditorLayoutProps,
): ReactElement {
  return (
    <div className="flex h-dvh flex-col" data-testid="plumix-editor-layout">
      <header
        className="flex items-center gap-3 border-b px-4 py-2"
        data-testid="plumix-editor-header"
      >
        <input
          type="text"
          placeholder="Untitled"
          className="flex-1 bg-transparent outline-none"
          data-testid="plumix-editor-title-input"
        />
        <span
          className="rounded bg-muted px-2 py-1 text-xs"
          data-testid="plumix-editor-status-pill"
        >
          Draft
        </span>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          data-testid="plumix-editor-publish-button"
        >
          Publish
        </button>
      </header>
      <div
        className="grid flex-1 grid-cols-[260px_1fr_320px] overflow-hidden"
        data-testid="plumix-editor-cols"
      >
        <aside
          className="overflow-y-auto border-r"
          data-testid="plumix-editor-left"
        >
          <Tabs defaultValue="blocks" className="h-full">
            <TabsList className="w-full">
              <TabsTrigger value="blocks" data-testid="plumix-editor-tab-blocks">
                Blocks
              </TabsTrigger>
              <TabsTrigger value="outline" data-testid="plumix-editor-tab-outline">
                Outline
              </TabsTrigger>
            </TabsList>
            <TabsContent value="blocks">
              <Puck.Components />
            </TabsContent>
            <TabsContent value="outline">
              <Puck.Outline />
            </TabsContent>
          </Tabs>
        </aside>
        <main
          className="overflow-auto"
          data-testid="plumix-editor-canvas"
        >
          <Puck.Preview />
        </main>
        <aside
          className="overflow-y-auto border-l"
          data-testid="plumix-editor-right"
        >
          <Puck.Fields />
        </aside>
      </div>
    </div>
  );
}
