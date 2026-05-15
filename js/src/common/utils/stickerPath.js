// Shared sticker-path helpers. Previously these were duplicated across
// StickerList, StickerPicker, EditStickerModal and StickerSection. Keeping the
// recognition rules in one place means adding a new animated format (e.g.
// future Lottie .lottie packages) only requires editing this file.

export function isLottiePath(path) {
  return !!path && path.toLowerCase().endsWith('.json');
}

export function isTgsPath(path) {
  return !!path && path.toLowerCase().endsWith('.tgs');
}

export function isAnimatedPath(path) {
  return isLottiePath(path) || isTgsPath(path);
}

/**
 * Sanitize a raw string into a safe category code:
 * lowercase, strip diacritics, replace any non-alphanumeric chars with _,
 * trim leading/trailing underscores.
 *
 * Mirrors the backend regex `^[a-z0-9_]*$` enforced in StickerResource and
 * RenameCategoryController, so the same value passes server-side validation.
 */
export function sanitizeCategoryCode(raw) {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
