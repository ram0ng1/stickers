import app from 'flarum/forum/app';
import { initLottieInRoot } from '../common/utils/renderLottie';
import { initTgsInRoot } from '../common/utils/renderTgs';
import type { AnimationOptions } from '../common/utils/animation';

function getAnimOptions(): AnimationOptions {
  return app.forum.attribute('ramonStickersHoverPlay') ? { hoverPlay: true } : {};
}

function applyTooltipSetting(root: ParentNode) {
  if (app.forum.attribute('ramonStickersShowTooltip') !== false) return;

  root.querySelectorAll('.Sticker[title]').forEach((el) => el.removeAttribute('title'));
}

function initStickersInRoot(root: ParentNode) {
  const opts = getAnimOptions();
  initLottieInRoot(root, opts);
  initTgsInRoot(root, opts);
  applyTooltipSetting(root);
}

/**
 * Anima os stickers Lottie/TGS dos posts.
 *
 * Os posts chegam pelo m.trust, sem hook do Mithril: o observer pega os nós
 * novos. Só varre o que foi adicionado (a partir do pai, que cobre o caso de
 * o próprio nó ser o sticker), não o documento inteiro a cada redraw.
 */
export default function initPostStickers() {
  const observer = new MutationObserver((mutations) => {
    const roots = new Set<Element>();
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) roots.add(node.parentElement || node);
      });
    });
    roots.forEach((root) => {
      if (root.isConnected) initStickersInRoot(root);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
