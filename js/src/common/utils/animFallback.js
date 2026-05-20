/**
 * Render a visible fallback marker into an animated-sticker container when the
 * animation cannot be loaded.
 *
 * lottie-web renders into a container element; when fetching/decoding fails
 * (most commonly because the file is on a different origin — animated stickers
 * MUST be same-origin, see renderLottie.js / renderTgs.js) the container was
 * previously left completely empty, so the failure was invisible: the picker
 * just showed a blank cell. This injects a small warning glyph plus a
 * `title` tooltip naming the URL and reason, so the breakage is at least
 * noticeable and diagnosable.
 *
 * @param {HTMLElement} container - the animation container element
 * @param {string}      url       - the URL that failed to load
 * @param {string}      [reason]  - short human-readable failure reason
 */
export function renderAnimFallback(container, url, reason) {
  if (!container) return;

  // Drop any partial canvas a failed render may have left behind.
  container.querySelectorAll('canvas').forEach((c) => c.remove());

  let fallback = container.querySelector('.StickerAnim-fallback');
  if (!fallback) {
    fallback = document.createElement('span');
    fallback.className = 'StickerAnim-fallback';
    fallback.textContent = '⚠'; // ⚠
    // Inline styles keep this self-contained (no LESS dependency).
    fallback.style.cssText =
      'display:flex;align-items:center;justify-content:center;' +
      'width:100%;height:100%;min-width:32px;min-height:32px;' +
      'font-size:1.4em;opacity:0.45;cursor:help;';
    container.appendChild(fallback);
  }

  fallback.title = reason ? reason + ' — ' + url : url;
}
