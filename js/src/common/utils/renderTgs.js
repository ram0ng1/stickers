/**
 * Renders TGS (Telegram animated sticker) files using lottie-web canvas renderer.
 * TGS = gzip-compressed Lottie JSON animations.
 *
 * IMPORTANT: lottie-web canvas renderer creates a <canvas> INSIDE the container.
 * The container must be a regular HTML element (div/span), NOT a <canvas>.
 */
import lottie from 'lottie-web/build/player/lottie_canvas';

async function decompressTgs(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const buffer = await response.arrayBuffer();

  // DecompressionStream is available in modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+)
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();

    const reader = ds.readable.getReader();
    const chunks = [];
    let done = false;

    while (!done) {
      const { done: d, value } = await reader.read();
      done = d;
      if (value) chunks.push(value);
    }

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }

    return JSON.parse(new TextDecoder().decode(out));
  }

  throw new Error('DecompressionStream not supported in this browser');
}

/**
 * Render a TGS animation into a container element.
 *
 * @param {HTMLElement} container            - Container element (div/span). Must NOT be <canvas>.
 * @param {string}      tgsUrl               - URL of the .tgs file
 * @param {object}      [options]
 * @param {boolean}     [options.loop=true]
 * @param {boolean}     [options.autoplay=true]
 * @param {boolean}     [options.hoverPlay=false]  - If true, animation is paused on first frame
 *                                                   and plays only while the mouse is over
 *                                                   `options.hoverTarget` (or `container`).
 * @param {HTMLElement} [options.hoverTarget]       - Element that triggers play/pause on hover.
 *                                                   Defaults to `container`.
 */
export async function renderTgs(container, tgsUrl, options = {}) {
  try {
    const animationData = await decompressTgs(tgsUrl);

    // Remove ALL existing canvases — covers same-type and cross-type leftovers
    container.querySelectorAll('canvas').forEach((c) => c.remove());

    const anim = lottie.loadAnimation({
      container,
      renderer: 'canvas',
      loop: options.loop !== false,
      // When hoverPlay is on, start paused
      autoplay: options.hoverPlay ? false : options.autoplay !== false,
      animationData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        clearCanvas: true,
      },
    });

    // Tag the canvas lottie creates so we can remove it on re-render
    anim.addEventListener('DOMLoaded', () => {
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.setAttribute('data-tgs-canvas', '1');

      // Show first frame statically when hoverPlay is active
      if (options.hoverPlay) {
        anim.goToAndStop(0, true);
      }
    });

    if (options.hoverPlay) {
      const target = options.hoverTarget || container;
      target.addEventListener('mouseenter', () => anim.play());
      target.addEventListener('mouseleave', () => anim.goToAndStop(0, true));
    }
  } catch (err) {
    console.warn('[Stickers] Could not render TGS:', tgsUrl, err);
  }
}

/**
 * Initialize all TGS elements in a given root element.
 * Elements must have class `Sticker--tgs` and attribute `data-tgs="url"`.
 *
 * @param {Element|null} root
 * @param {object}       [options]  Passed directly to renderTgs (e.g. { hoverPlay: true })
 */
export function initTgsInRoot(root, options = {}) {
  const elements = (root || document).querySelectorAll('.Sticker--tgs:not([data-tgs-init])');

  elements.forEach((el) => {
    el.setAttribute('data-tgs-init', '1');
    const url = el.getAttribute('data-tgs');
    if (url) renderTgs(el, url, options);
  });
}
