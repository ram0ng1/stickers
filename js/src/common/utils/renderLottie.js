import loadLottie from './loadLottie';
import { renderAnimFallback } from './animFallback';

// Limite do JSON bruto: um Lottie de centenas de MB trava a aba no parse.
// Arquivos reais ficam bem abaixo de 1 MB.
const MAX_LOTTIE_BYTES = 8 * 1024 * 1024;

async function fetchLottieJson(url) {
  // Só a mesma origem. Também barra javascript:/data:/file:, cuja origin é "null".
  let parsed;
  try {
    parsed = new URL(url, location.origin);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.origin !== location.origin) throw new Error('Lottie URL must be same-origin');

  const response = await fetch(parsed.href);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  // fetch segue redirecionamentos: confere a origem de onde a resposta veio.
  if (new URL(response.url).origin !== location.origin) throw new Error('Lottie URL must be same-origin');

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_LOTTIE_BYTES) {
      try {
        await reader.cancel();
      } catch (_) {
        /* noop */
      }
      throw new Error('Lottie payload exceeds ' + MAX_LOTTIE_BYTES + ' bytes');
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

/**
 * Renderiza uma animação Lottie (JSON) dentro do container.
 *
 * O renderer canvas do lottie-web cria o <canvas> dentro do container, então
 * ele precisa ser um elemento comum (div/span), nunca um <canvas>.
 *
 * @param {HTMLElement} container
 * @param {string}      lottieUrl
 * @param {object}      [options]
 * @param {boolean}     [options.loop=true]
 * @param {boolean}     [options.autoplay=true]
 * @param {boolean}     [options.hoverPlay=false]  Parada no 1º quadro; toca só com o mouse em cima.
 * @param {HTMLElement} [options.hoverTarget]      Elemento que dispara o hover (padrão: o container).
 * @returns {Promise<object|null>}
 */
export async function renderLottie(container, lottieUrl, options = {}) {
  try {
    const animData = await fetchLottieJson(lottieUrl);

    // Tira qualquer canvas anterior, inclusive de outro formato (container reaproveitado).
    container.querySelectorAll('canvas').forEach((c) => c.remove());

    const lottie = await loadLottie();
    const anim = lottie.loadAnimation({
      container,
      renderer: 'canvas',
      loop: options.loop !== false,
      autoplay: options.hoverPlay ? false : options.autoplay !== false,
      animationData: animData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        clearCanvas: true,
      },
    });

    anim.addEventListener('DOMLoaded', () => {
      const canvas = container.querySelector('canvas');
      if (canvas) canvas.setAttribute('data-lottie-canvas', '1');

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
    // Quase sempre é uma URL de outra origem: animações precisam estar no
    // próprio fórum. O marcador deixa a falha visível em vez de uma célula vazia.
    console.warn('[Stickers] Could not render Lottie:', lottieUrl, err);
    renderAnimFallback(container, lottieUrl, err && err.message);
    return null;
  }
}

/**
 * Inicializa os `.Sticker--lottie[data-lottie]` ainda não iniciados dentro de `root`.
 *
 * @param {Element|null} root
 * @param {object}       [options]  Repassado ao renderLottie (ex.: { hoverPlay: true }).
 */
export function initLottieInRoot(root, options = {}) {
  const els = (root || document).querySelectorAll('.Sticker--lottie:not([data-lottie-init])');

  els.forEach((el) => {
    el.setAttribute('data-lottie-init', '1');
    const url = el.getAttribute('data-lottie');
    if (url) renderLottie(el, url, options);
  });
}
