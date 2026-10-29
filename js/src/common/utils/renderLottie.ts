import { AnimationOptions, failAnimation, fetchSameOrigin, playAnimation, readLimited } from './animation';

// Limite do JSON bruto: um Lottie de centenas de MB trava a aba no parse.
// Arquivos reais ficam bem abaixo de 1 MB.
const MAX_LOTTIE_BYTES = 8 * 1024 * 1024;

async function fetchLottieJson(url: string): Promise<unknown> {
  const response = await fetchSameOrigin(url, 'Lottie');
  if (!response.body) throw new Error('Empty response');

  const bytes = await readLimited(response.body, MAX_LOTTIE_BYTES, 'Lottie payload');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Renderiza uma animação Lottie (JSON) dentro do container.
 */
export async function renderLottie(container: HTMLElement, lottieUrl: string, options: AnimationOptions = {}) {
  try {
    return await playAnimation(container, await fetchLottieJson(lottieUrl), options, 'data-lottie-canvas');
  } catch (err) {
    return failAnimation(container, lottieUrl, 'Lottie', err);
  }
}

/**
 * Inicializa os `.Sticker--lottie[data-lottie]` ainda não iniciados dentro de `root`.
 */
export function initLottieInRoot(root: ParentNode | null, options: AnimationOptions = {}): void {
  (root || document).querySelectorAll<HTMLElement>('.Sticker--lottie:not([data-lottie-init])').forEach((el) => {
    el.setAttribute('data-lottie-init', '1');
    const url = el.getAttribute('data-lottie');
    if (url) renderLottie(el, url, options);
  });
}
