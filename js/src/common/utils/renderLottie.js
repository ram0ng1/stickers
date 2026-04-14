/**
 * Renders Lottie JSON animation files using lottie-web canvas renderer.
 *
 * IMPORTANT: lottie-web canvas renderer creates a <canvas> INSIDE the container.
 * The container must be a regular HTML element (div/span), NOT a <canvas>.
 */
import lottie from 'lottie-web/build/player/lottie_canvas';

/**
 * Render a Lottie JSON animation into a container element.
 *
 * @param {HTMLElement} container            - Container element (div/span). Must NOT be <canvas>.
 * @param {string}      lottieUrl            - URL of the .json Lottie file
 * @param {object}      [options]
 * @param {boolean}     [options.loop=true]
 * @param {boolean}     [options.autoplay=true]
 * @param {boolean}     [options.hoverPlay=false]  - If true, animation is paused on first frame
 *                                                   and plays only while the mouse is over
 *                                                   `options.hoverTarget` (or `container`).
 * @param {HTMLElement} [options.hoverTarget]       - Element that triggers play/pause on hover.
 *                                                   Defaults to `container`.
 * @returns {Promise<object|null>} lottie animation instance
 */
export async function renderLottie(container, lottieUrl, options = {}) {
  try {
    const response = await fetch(lottieUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const animData = await response.json();

    // Remove ALL existing canvases — covers same-type and cross-type leftovers
    // (e.g., a lottie canvas left behind when the container is reused for a TGS sticker)
    container.querySelectorAll('canvas').forEach((c) => c.remove());

    const anim = lottie.loadAnimation({
      container,
      renderer: 'canvas',
      loop: options.loop !== false,
      // When hoverPlay is on, start paused
      autoplay: options.hoverPlay ? false : options.autoplay !== false,
      animationData: animData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        clearCanvas: true,
      },
    });

    // Tag the canvas lottie creates so we can remove it on re-render
    anim.addEventListener('DOMLoaded', () => {
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.setAttribute('data-lottie-canvas', '1');

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

    return anim;
  } catch (err) {
    console.warn('[Stickers] Could not render Lottie:', lottieUrl, err);
    return null;
  }
}

/**
 * Initialize all Lottie elements in a given root.
 * Elements must have class `Sticker--lottie` and attribute `data-lottie="url"`.
 *
 * @param {Element|null} root
 * @param {object}       [options]  Passed directly to renderLottie (e.g. { hoverPlay: true })
 */
export function initLottieInRoot(root, options = {}) {
  const els = (root || document).querySelectorAll('.Sticker--lottie:not([data-lottie-init])');

  els.forEach((el) => {
    el.setAttribute('data-lottie-init', '1');
    const url = el.getAttribute('data-lottie');
    if (url) renderLottie(el, url, options);
  });
}
