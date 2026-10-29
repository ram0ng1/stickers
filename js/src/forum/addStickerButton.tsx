import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import TextEditorButton from 'flarum/common/components/TextEditorButton';
import { STICKER_ICON_PATH } from '../common/utils/stickerIcon';

import type TextEditor from 'flarum/common/components/TextEditor';
import type EditorDriverInterface from 'flarum/common/utils/EditorDriverInterface';
import type ItemList from 'flarum/common/utils/ItemList';
import type Mithril from 'mithril';

interface PickerState {
  isOpen: boolean;
  mountNode: HTMLElement | null;
  triggerBtn: HTMLElement | null;
}

// Um picker por TextEditor.
const instanceState = new WeakMap<TextEditor, PickerState>();

function getState(editor: TextEditor): PickerState {
  let state = instanceState.get(editor);
  if (!state) {
    state = { isOpen: false, mountNode: null, triggerBtn: null };
    instanceState.set(editor, state);
  }
  return state;
}

// Mesmo tamanho e alinhamento dos ícones do FontAwesome dentro de .Button-icon.
function stickerIcon() {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', width: '1em', height: '1em', verticalAlign: '-0.125em' }}
      aria-hidden="true"
    >
      <path d={STICKER_ICON_PATH} />
    </svg>
  );
}

function positionPicker(mountNode: HTMLElement | null, triggerBtn: HTMLElement | null) {
  const btn = triggerBtn && document.body.contains(triggerBtn) ? triggerBtn : document.querySelector<HTMLElement>('.Button-Sticker');
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

function closePicker(editor: TextEditor) {
  const state = getState(editor);
  if (!state.isOpen) return;

  state.isOpen = false;

  if (state.mountNode) {
    m.mount(state.mountNode, null);
  }

  m.redraw();
}

function openPicker(editor: TextEditor, triggerBtn: HTMLElement | null) {
  const state = getState(editor);

  if (!state.mountNode) {
    state.mountNode = document.createElement('div');
    state.mountNode.className = 'StickerPicker-wrapper';
    document.body.appendChild(state.mountNode);
  }

  state.triggerBtn = triggerBtn;
  state.isOpen = true;

  // O picker fica num chunk próprio: só baixa no primeiro clique.
  import('./components/StickerPicker').then(({ default: StickerPicker }) => {
    // Fechou (ou o editor saiu) enquanto o chunk carregava.
    if (!state.isOpen || !state.mountNode) return;

    m.mount(state.mountNode, {
      view: () => (
        <StickerPicker
          onInsert={(text: string) => {
            (editor.attrs as { composer: { editor: EditorDriverInterface } }).composer.editor.insertAtCursor(text, false);
            closePicker(editor);
          }}
          onClose={() => closePicker(editor)}
          triggerBtn={state.triggerBtn}
        />
      ),
    });

    // Posiciona no próximo tick, depois do render. A âncora é o `bottom`, então
    // a altura do picker não importa.
    setTimeout(() => positionPicker(state.mountNode, state.triggerBtn), 0);
  });
}

/**
 * Botão de sticker na barra do editor e o picker flutuante dele.
 */
export default function addStickerButton() {
  extend<TextEditor, 'toolbarItems'>(
    'flarum/common/components/TextEditor',
    'toolbarItems',
    function (this: TextEditor, items: ItemList<Mithril.Children>) {
      const editor = this;
      const label = app.translator.trans('ramon-stickers.forum.composer.sticker_tooltip');

      items.add(
        'stickers',
        <TextEditorButton
          className="Button Button--icon Button--link Button-Sticker"
          icon={stickerIcon()}
          aria-label={label}
          onclick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const state = getState(editor);
            if (state.isOpen) {
              closePicker(editor);
            } else {
              // Guarda o botão clicado: com dois editores abertos (resposta +
              // edição de post), o picker ancora no editor certo.
              const target = e.currentTarget as HTMLElement | null;
              openPicker(editor, target?.closest<HTMLElement>('.Button-Sticker') || target);
            }
          }}
        >
          {label}
        </TextEditorButton>,
        -10
      );
    }
  );

  extend<TextEditor, 'onremove'>('flarum/common/components/TextEditor', 'onremove', function (this: TextEditor) {
    const state = getState(this);
    state.isOpen = false;

    if (state.mountNode) {
      m.mount(state.mountNode, null);
      state.mountNode.remove();
      state.mountNode = null;
    }
    // Sem m.redraw() aqui: já estamos dentro do ciclo de remoção do Mithril.
  });
}
