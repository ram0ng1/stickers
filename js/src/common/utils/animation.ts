import loadLottie from './loadLottie';
import { renderAnimFallback } from './animFallback';

export interface AnimationOptions {
  loop?: boolean;
  autoplay?: boolean;
  /** Parada no 1º quadro; toca só com o mouse em cima. */
  hoverPlay?: boolean;
  /** Elemento que dispara o hover (padrão: o container). */
  hoverTarget?: HTMLElement;
}

/**
 * Toca uma animação Lottie já decodificada dentro do container.
 *
 * O renderer canvas do lottie-web cria o <canvas> dentro do container, então
 * ele precisa ser um elemento comum (div/span), nunca um <canvas>.
 */
export async function playAnimation(container: HTMLElement, animationData: unknown, options: AnimationOptions, canvasAttribute: string) {
  // Tira qualquer canvas anterior, inclusive de outro formato (container reaproveitado).
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
    if (canvas) canvas.setAttribute(canvasAttribute, '1');

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
}

/**
 * Só a mesma origem. Também barra javascript:/data:/file:, cuja origin é "null".
 */
export async function fetchSameOrigin(url: string, label: string): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url, location.origin);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.origin !== location.origin) throw new Error(label + ' URL must be same-origin');

  const response = await fetch(parsed.href);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  // fetch segue redirecionamentos: confere a origem de onde a resposta veio.
  if (new URL(response.url).origin !== location.origin) throw new Error(label + ' URL must be same-origin');

  return response;
}

/**
 * Lê um stream inteiro, abortando acima de `maxBytes`.
 */
export async function readLimited(stream: ReadableStream<Uint8Array>, maxBytes: number, label: string): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch (_) {
        /* noop */
      }
      throw new Error(label + ' exceeds ' + maxBytes + ' bytes');
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

export function failAnimation(container: HTMLElement, url: string, kind: string, err: unknown): null {
  // Quase sempre é uma URL de outra origem: animações precisam estar no
  // próprio fórum. O marcador deixa a falha visível em vez de uma célula vazia.
  console.warn('[Stickers] Could not render ' + kind + ':', url, err);
  renderAnimFallback(container, url, err instanceof Error ? err.message : undefined);
  return null;
}
