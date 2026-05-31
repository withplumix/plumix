// Reserves space so the lazy-mount placeholder isn't a zero-height
// target that intersects the viewport on first paint and short-circuits
// the deferral. Shared by every block / variation / pattern row that
// gates a Thumbnail render behind LazyMount.
export const THUMBNAIL_MIN_HEIGHT = 120;
