import type { Editor } from "@tiptap/react";
import { createContext, useContext } from "react";

/**
 * Lets sibling panels (Inspector, Block menu) reach the live Tiptap
 * editor without prop-drilling through the form/field tree that owns
 * it. `TiptapEditor` publishes itself via `onEditorReady`; the form
 * stores the instance in state and exposes it through this context.
 */
const EditorContext = createContext<Editor | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useActiveEditor(): Editor | null {
  return useContext(EditorContext);
}
