import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import TextEditorButton from 'flarum/common/components/TextEditorButton';
import { initLottieInRoot } from '../common/utils/renderLottie';
import { initTgsInRoot } from '../common/utils/renderTgs';
import { STICKER_ICON_PATH } from '../common/utils/stickerIcon';

export { default as extend } from './extend';

// Mesmo tamanho e alinhamento dos ícones do FontAwesome dentro de .Button-icon.
const stickerIconVnode = () =>
  m(
    'svg',
    {
      fill: 'currentColor',
      viewBox: '0 0 24 24',
      xmlns: 'http://www.w3.org/2000/svg',
      style: { display: 'inline-block', width: '1em', height: '1em', verticalAlign: '-0.125em' },
      'aria-hidden': 'true',
    },
    m('path', { d: STICKER_ICON_PATH })
  );

app.initializers.add('ramon-stickers', () => {
  function getAnimOptions() {
    const hoverPlay = !!app.forum.attribute('ramonStickersHoverPlay');
    return hoverPlay ? { hoverPlay: true } : {};
  }

  function shouldShowTooltip() {
    return app.forum.attribute('ramonStickersShowTooltip') !== false;
  }

  function applyTooltipSetting(root) {
    if (shouldShowTooltip()) return;
    (root || document).querySelectorAll('.Sticker[title]').forEach((el) => {
      el.removeAttribute('title');
    });
  }

  function initStickersInRoot(root) {
    const opts = getAnimOptions();
    initLottieInRoot(root, opts);
    initTgsInRoot(root, opts);
    applyTooltipSetting(root);
  }

  // Os posts chegam pelo m.trust, sem hook do Mithril: o observer pega os nós
  // novos. Só varre o que foi adicionado (a partir do pai, que cobre o caso de
  // o próprio nó ser o sticker), não o documento inteiro a cada redraw.
  const observer = new MutationObserver((mutations) => {
    const roots = new Set();
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) roots.add(node.parentElement || node);
      });
    });
    roots.forEach((root) => {
      if (root.isConnected) initStickersInRoot(root);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Um picker por TextEditor.
  const instanceState = new WeakMap();

  function getState(instance) {
    if (!instanceState.has(instance)) {
      instanceState.set(instance, {
        isOpen: false,
        mountNode: null,
      });
    }
    return instanceState.get(instance);
  }

  extend('flarum/common/components/TextEditor', 'toolbarItems', function (items) {
    const editor = this;

    items.add(
      'stickers',
      m(
        TextEditorButton,
        {
          className: 'Button Button--icon Button--link Button-Sticker',
          icon: stickerIconVnode(),
          'aria-label': app.translator.trans('ramon-stickers.forum.composer.sticker_tooltip'),
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();

            const state = getState(editor);
            if (state.isOpen) {
              closePicker(editor);
            } else {
              // Guarda o botão clicado: com dois editores abertos (resposta +
              // edição de post), o picker ancora no editor certo.
              const triggerBtn = e.currentTarget?.closest('.Button-Sticker') || e.currentTarget;
              openPicker(editor, triggerBtn);
            }
          },
        },
        app.translator.trans('ramon-stickers.forum.composer.sticker_tooltip')
      ),
      -10
    );
  });

  extend('flarum/common/components/TextEditor', 'onremove', function () {
    const state = getState(this);
    state.isOpen = false;

    if (state.mountNode) {
      m.mount(state.mountNode, null);
      state.mountNode.remove();
      state.mountNode = null;
    }
    // Sem m.redraw() aqui: já estamos dentro do ciclo de remoção do Mithril.
  });

  function openPicker(editorInstance, triggerBtn) {
    const state = getState(editorInstance);

    if (!state.mountNode) {
      state.mountNode = document.createElement('div');
      state.mountNode.className = 'StickerPicker-wrapper';
      document.body.appendChild(state.mountNode);
    }

    state.triggerBtn = triggerBtn || null;
    state.isOpen = true;

    // O picker fica num chunk próprio: só baixa no primeiro clique.
    import('./components/StickerPicker').then(({ default: StickerPicker }) => {
      // Fechou (ou o editor saiu) enquanto o chunk carregava.
      if (!state.isOpen || !state.mountNode) return;

      m.mount(state.mountNode, {
        view: () =>
          m(StickerPicker, {
            onInsert: (text) => {
              editorInstance.attrs.composer.editor.insertAtCursor(text);
              closePicker(editorInstance);
            },
            onClose: () => closePicker(editorInstance),
            triggerBtn: state.triggerBtn,
          }),
      });

      // Posiciona no próximo tick, depois do render. A âncora é o `bottom`, então
      // a altura do picker não importa.
      setTimeout(() => positionPicker(state.mountNode, state.triggerBtn), 0);
    });
  }

  function closePicker(editorInstance) {
    const state = getState(editorInstance);
    if (!state.isOpen) return;

    state.isOpen = false;

    if (state.mountNode) {
      m.mount(state.mountNode, null);
    }

    m.redraw();
  }

  function positionPicker(mountNode, triggerBtn) {
    const btn = triggerBtn && document.body.contains(triggerBtn) ? triggerBtn : document.querySelector('.Button-Sticker');
    if (!btn || !mountNode) return;

    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const pickerW = mountNode.offsetWidth || 320;

    if (window.innerWidth <= 640) {
      // Celular: sobreposição centralizada.
      Object.assign(mountNode.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        bottom: '',
        transform: 'translate(-50%,-50%)',
        zIndex: '1050',
        width: 'min(340px, 94vw)',
      });
      return;
    }

    // Sempre acima do botão.
    const bottom = window.innerHeight - rect.top + gap;
    let left = rect.left + rect.width / 2 - pickerW / 2;

    left = Math.max(margin, Math.min(left, window.innerWidth - pickerW - margin));

    Object.assign(mountNode.style, {
      position: 'fixed',
      bottom: bottom + 'px',
      top: '',
      left: left + 'px',
      transform: '',
      zIndex: '1050',
      width: '',
    });
  }
});
