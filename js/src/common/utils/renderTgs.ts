import { AnimationOptions, failAnimation, fetchSameOrigin, playAnimation, readLimited } from './animation';

// TGS (sticker animado do Telegram) é um Lottie JSON comprimido com gzip.
// Limite do tamanho descomprimido contra gzip bomb: um .tgs pequeno que vira
// centenas de MB travaria o navegador. TGS reais ficam abaixo de 1 MB.
const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

async function decompressTgs(url: string): Promise<unknown> {
  const response = await fetchSameOrigin(url, 'TGS');
  const buffer = await response.arrayBuffer();

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not supported in this browser');
  }

  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(buffer));
  writer.close();

  const bytes = await readLimited(ds.readable, MAX_DECOMPRESSED_BYTES, 'TGS decompressed payload');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Renderiza um TGS dentro do container (mesmas regras do renderLottie).
 */
export async function renderTgs(container: HTMLElement, tgsUrl: string, options: AnimationOptions = {}) {
  try {
    return await playAnimation(container, await decompressTgs(tgsUrl), options, 'data-tgs-canvas');
  } catch (err) {
    return failAnimation(container, tgsUrl, 'TGS', err);
  }
}

/**
 * Inicializa os `.Sticker--tgs[data-tgs]` ainda não iniciados dentro de `root`.
 */
export function initTgsInRoot(root: ParentNode | null, options: AnimationOptions = {}): void {
  (root || document).querySelectorAll<HTMLElement>('.Sticker--tgs:not([data-tgs-init])').forEach((el) => {
    el.setAttribute('data-tgs-init', '1');
    const url = el.getAttribute('data-tgs');
    if (url) renderTgs(el, url, options);
  });
}
