import { replace as replaceEmoji } from 'node-emoji';

/**
 * Convert emoji characters in a filename (without extension) to their
 * English names, producing a clean slug suitable for sticker titles and
 * text-replacement codes.
 *
 * Examples:
 *   "😀_happy"      → "grinning_happy"
 *   "🎉party_time"  → "tada_party_time"
 *   "sticker_😂"    → "sticker_joy"
 *   "cool😎"        → "cool_sunglasses"
 */
export function emojiToSlug(raw) {
  // Replace each emoji with _name_ so adjacent text stays separated
  const replaced = replaceEmoji(raw, (emoji) => '_' + emoji.key + '_');

  return replaced
    .replace(/_+/g, '_')   // collapse multiple underscores
    .replace(/^_|_$/g, '') // trim leading/trailing underscores
    .toLowerCase();
}

/**
 * Convert a raw filename (with or without extension) to a human-readable
 * display title: emoji become their English names, underscores/hyphens
 * become spaces, result is title-cased.
 *
 * Examples:
 *   "😀_happy.tgs"  → "Grinning Happy"
 *   "party🎉time"   → "Party Tada Time"
 */
export function emojiToTitle(filename) {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, '');

  const slug = emojiToSlug(base);

  // Replace _ and - with spaces, then title-case
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
