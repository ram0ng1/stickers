import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import TextEditorButton from 'flarum/common/components/TextEditorButton';
import Sticker from '../common/models/Sticker';
import { initLottieInRoot } from '../common/utils/renderLottie';
import { initTgsInRoot } from '../common/utils/renderTgs';

// SVG sticker icon — the classic "sticker with folded corner" shape.
// Path 1: sticker body (rounded rect with top-right corner cut diagonally).
// Path 2: the folded/peeled corner detail.
// Both filled with currentColor — no outline tricks needed.
const STICKER_ICON_PATH =
  'M20,11.5 L20,7.5 C20,5.56700338 18.4329966,4 16.5,4 L7.5,4 C5.56700338,4 4,5.56700338 4,7.5 ' +
  'L4,16.5 C4,18.4329966 5.56700338,20 7.5,20 L12.5,20 C13.3284271,20 14,19.3284271 14,18.5 ' +
  'L14,16.5 C14,14.5670034 15.5670034,13 17.5,13 L18.5,13 C19.3284271,13 20,12.3284271 20,11.5 Z ' +
  'M19.9266247,13.5532532 C19.522053,13.8348821 19.0303092,14 18.5,14 L17.5,14 ' +
  'C16.1192881,14 15,15.1192881 15,16.5 L15,18.5 C15,18.9222858 14.8952995,19.3201175 14.7104416,19.668952 ' +
  'C17.4490113,18.8255402 19.5186665,16.4560464 19.9266247,13.5532532 Z';

// Size and vertical-align match FontAwesome solid icons inside .Button-icon spans.
// FA renders at the span's font-size (1em) with -0.125em baseline correction.
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
  app.store.models['stickers'] = Sticker;

  // Read settings serialized from PHP via Settings extender
  function getAnimOptions() {
    const hoverPlay = !!app.forum.attribute('ramonStickersHoverPlay');
    return hoverPlay ? { hoverPlay: true } : {};
  }

  function shouldShowTooltip() {
    return app.forum.attribute('ramonStickersShowTooltip') !== false;
  }

  // Remove native `title` tooltip from sticker elements in a given root
  function applyTooltipSetting(root) {
    if (shouldShowTooltip()) return;
    (root || document).querySelectorAll('.Sticker[title]').forEach((el) => {
      el.removeAttribute('title');
    });
  }

  // Initialize animated stickers in posts via MutationObserver
  function initStickersInRoot(root) {
    const opts = getAnimOptions();
    initLottieInRoot(root, opts);
    initTgsInRoot(root, opts);
    applyTooltipSetting(root);
  }

  const observer = new MutationObserver((mutations) => {
    let hasNew = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) hasNew = true;
      });
    });
    if (hasNew) initStickersInRoot(document.body);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // State: one picker per TextEditor instance, tracked via WeakMap
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

  // Add sticker button to the TextEditor toolbar
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
              openPicker(editor);
            }
          },
        },
        app.translator.trans('ramon-stickers.forum.composer.sticker_tooltip')
      ),
      -10
    );
  });

  // Cleanup when the TextEditor is removed
  extend('flarum/common/components/TextEditor', 'onremove', function () {
    const state = getState(this);
    state.isOpen = false;

    if (state.mountNode) {
      m.mount(state.mountNode, null);
      state.mountNode.remove();
      state.mountNode = null;
    }
    // Do NOT call m.redraw() here – we're already inside Mithril's removal cycle
  });

  function openPicker(editorInstance) {
    const state = getState(editorInstance);

    // Create mount node if needed
    if (!state.mountNode) {
      state.mountNode = document.createElement('div');
      state.mountNode.className = 'StickerPicker-wrapper';
      document.body.appendChild(state.mountNode);
    }

    state.isOpen = true;

    const StickerPicker = require('./components/StickerPicker').default;

    m.mount(state.mountNode, {
      view: () =>
        m(StickerPicker, {
          onInsert: (text) => {
            editorInstance.attrs.composer.editor.insertAtCursor(text);
            closePicker(editorInstance);
          },
          onClose: () => closePicker(editorInstance),
        }),
    });

    // Position after Mithril has rendered (0ms = next event loop tick).
    // `bottom` anchor is used, so picker height doesn't affect vertical position.
    setTimeout(() => positionPicker(state.mountNode), 0);

    m.redraw();
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

  function positionPicker(mountNode) {
    const btn = document.querySelector('.Button-Sticker');
    if (!btn || !mountNode) return;

    const rect   = btn.getBoundingClientRect();
    const margin = 8;
    const gap    = 6;
    const pickerW = mountNode.offsetWidth || 320;

    if (window.innerWidth <= 640) {
      // Mobile: centered overlay
      Object.assign(mountNode.style, {
        position:  'fixed',
        top:       '50%',
        left:      '50%',
        bottom:    '',
        transform: 'translate(-50%,-50%)',
        zIndex:    '1050',
        width:     'min(340px, 94vw)',
      });
      return;
    }

    // Always above the button: anchor the picker's bottom edge just above the button top.
    // Using `bottom` makes it independent of picker height — no measuring needed.
    const bottom = window.innerHeight - rect.top + gap;
    let left     = rect.left + rect.width / 2 - pickerW / 2;

    left = Math.max(margin, Math.min(left, window.innerWidth - pickerW - margin));

    Object.assign(mountNode.style, {
      position:  'fixed',
      bottom:    bottom + 'px',
      top:       '',           // clear top so it doesn't conflict
      left:      left + 'px',
      transform: '',
      zIndex:    '1050',
      width:     '',
    });
  }
});
