// Context/provider/hooks/BlockRenderer live in context.js so leaf components
// (Link, Image) import their hooks without pulling in this barrel — that cycles.
export { BlockRenderer, PlumixProvider } from "./context.js";
export {
  useBasePath,
  useImageConfig,
  useIsEditing,
  useIsPreview,
  usePlumixMode,
  useQueriedEntry,
  useTokens,
  useUser,
} from "./context.js";
export type {
  PlumixContextValue,
  PlumixRenderMode,
  RendererQueriedEntry,
  RendererUser,
} from "./context.js";

export { Link } from "./link.js";
export type { LinkProps, LinkTarget } from "./link.js";
export { Image } from "./image.js";
export type { ImageProps } from "./image.js";
export type {
  ImageResolver,
  RemotePattern,
  BuildImageAttrsInput,
  ImageAttrs,
} from "./image-attrs.js";
export { buildImageAttrs, matchesRemotePattern } from "./image-attrs.js";

// Editor bridge: transport primitives + typed message contract, shared by
// the admin shell (parent) and the SSR-injected canvas runtime (iframe).
export {
  createHandshake,
  encode,
  isHandshakeFrame,
  parseEnvelope,
} from "./bridge.js";
export type { Envelope, Handshake, HandshakeRole } from "./bridge.js";
export { EDITOR_BRIDGE_CHANNEL } from "./editor-protocol.js";
export type {
  BlockRect,
  CanvasMessage,
  EditorBridgeMessage,
  HostMessage,
  SerializedLoaderData,
  SlotRect,
} from "./editor-protocol.js";
