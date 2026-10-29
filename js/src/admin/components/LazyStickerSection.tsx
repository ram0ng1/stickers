import Component from 'flarum/common/Component';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

import type Mithril from 'mithril';

let Section: Mithril.ComponentTypes<any> | null = null;
let pending: Promise<void> | null = null;

// A seção (com o node-emoji, o file-saver e o lottie-web) só aparece na página
// desta extensão, então fica fora do admin.js que toda página do admin baixa.
export default class LazyStickerSection extends Component {
  oninit(vnode: Mithril.Vnode<any, this>) {
    super.oninit(vnode);

    if (!Section && !pending) {
      pending = import('./StickerSection')
        .then((mod) => {
          Section = mod.default;
          m.redraw();
        })
        .catch(() => {
          // Chunk falhou (deploy no meio, rede): a próxima visita tenta de novo.
          pending = null;
        });
    }
  }

  view() {
    return Section ? m(Section) : <LoadingIndicator />;
  }
}
