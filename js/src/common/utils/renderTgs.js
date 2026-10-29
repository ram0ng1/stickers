import loadLottie from './loadLottie';
import { renderAnimFallback } from './animFallback';

// TGS (sticker animado do Telegram) é um Lottie JSON comprimido com gzip.
// Limite do tamanho descomprimido contra gzip bomb: um .tgs pequeno que vira
// centenas de MB travaria o navegador. TGS reais ficam abaixo de 1 MB.
const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

async function decompressTgs(url) {
  // Só a mesma origem. Também barra javascript:/data:/file:, cuja origin é "null".
  let parsed;
  try {
    parsed = new URL(url, location.origin);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.origin !== location.origin) throw new Error('TGS URL must be same-origin');

  const response = await fetch(parsed.href);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  // fetch segue redirecionamentos: confere a origem de onde a resposta veio.
  if (new URL(response.url).origin !== location.origin) throw new Error('TGS URL must be same-origin');
  const buffer = await response.arrayBuffer();

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not supported in this browser');
  }

  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(buffer));
  writer.close();

  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_DECOMPRESSED_BYTES) {
      try {
        await reader.cancel();
      } catch (_) {
        /* noop */
      }
      throw new Error('TGS decompressed payload exceeds ' + MAX_DECOMPRESSED_BYTES + ' bytes');
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(out));
}

/**
 * Renderiza um TGS dentro do container (mesmas regras do renderLottie).
 *
 * @param {HTMLElement} container
 * @param {string}      tgsUrl
 * @param {object}      [options]
 * @param {boolean}     [options.loop=true]
 * @param {boolean}     [options.autoplay=true]
 * @param {boolean}     [options.hoverPlay=false]  Parada no 1º quadro; toca só com o mouse em cima.
 * @param {HTMLElement} [options.hoverTarget]      Elemento que dispara o hover (padrão: o container).
 */
export async function renderTgs(container, tgsUrl, options = {}) {
  try {
    const animationData = await decompressTgs(tgsUrl);

    container.querySelectorAll('canvas').forEach((c) => c.remove());

    const lottie = await loadLottie();
    const anim = lottie.loadAnimation({
      container,
      renderer: 'canvas',
      loop: options.loop !== false,
      autoplay: options.hoverPlay ? false : options.autoplay !== false,
      animationData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        clearCanvas: true,
      },
    });

    anim.addEventListener('DOMLoaded', () => {
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.setAttribute('data-tgs-canvas', '1');

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
    // Quase sempre é uma URL de outra origem: animações precisam estar no
    // próprio fórum. O marcador deixa a falha visível em vez de uma célula vazia.
    console.warn('[Stickers] Could not render TGS:', tgsUrl, err);
    renderAnimFallback(container, tgsUrl, err && err.message);
  }
}

/**
 * Inicializa os `.Sticker--tgs[data-tgs]` ainda não iniciados dentro de `root`.
 *
 * @param {Element|null} root
 * @param {object}       [options]  Repassado ao renderTgs (ex.: { hoverPlay: true }).
 */
export function initTgsInRoot(root, options = {}) {
  const elements = (root || document).querySelectorAll('.Sticker--tgs:not([data-tgs-init])');

  elements.forEach((el) => {
    el.setAttribute('data-tgs-init', '1');
    const url = el.getAttribute('data-tgs');
    if (url) renderTgs(el, url, options);
  });
}
