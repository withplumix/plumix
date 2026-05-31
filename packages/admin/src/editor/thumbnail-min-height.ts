// Reserves space so the lazy-mount placeholder isn't a zero-height
// target that intersects the viewport on first paint and short-circuits
// the deferral. Shared by every block / variation / pattern row that
// gates a Thumbnail render behind LazyMount.
export const THUMBNAIL_MIN_HEIGHT = 120;

// Matches the `h-12` strip the slash-menu card uses so block + pattern +
// variation previews all line up at the same height inside the slash
// menu's narrow column.
export const SLASH_THUMBNAIL_MIN_HEIGHT = 48;
