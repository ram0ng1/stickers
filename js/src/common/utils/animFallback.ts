/**
 * Mostra um marcador no lugar de uma animação que não carregou.
 *
 * Um container vazio esconderia a falha. O `title` leva a URL e o motivo,
 * para dar para diagnosticar.
 */
export function renderAnimFallback(container: HTMLElement | null, url: string, reason?: string): void {
  if (!container) return;

  container.querySelectorAll('canvas').forEach((c) => c.remove());

  let fallback = container.querySelector<HTMLElement>('.StickerAnim-fallback');
  if (!fallback) {
    fallback = document.createElement('span');
    fallback.className = 'StickerAnim-fallback';
    fallback.textContent = '⚠';
    // Estilo inline para não depender do LESS.
    fallback.style.cssText =
      'display:flex;align-items:center;justify-content:center;' +
      'width:100%;height:100%;min-width:32px;min-height:32px;' +
      'font-size:1.4em;opacity:0.45;cursor:help;';
    container.appendChild(fallback);
  }

  fallback.title = reason ? reason + ' — ' + url : url;
}
