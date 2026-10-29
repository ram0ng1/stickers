import app from 'flarum/forum/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { isLottiePath, isTgsPath } from '../../common/utils/stickerPath';

import type Mithril from 'mithril';

interface StickerRow {
  id: string;
  attributes: {
    title: string | null;
    textToReplace: string;
    path: string | null;
    category: string | null;
    categoryName: string | null;
  };
}

interface PickerSticker {
  id: string;
  name: string | null;
  textToReplace: string;
  url: string;
  category: string | null;
  categoryName: string | null;
  isLottie: boolean;
  isTgs: boolean;
}

interface Catalog {
  stickers: PickerSticker[];
  byCategory: Record<string, PickerSticker[]>;
  categories: string[];
}

interface StickerPage {
  data?: StickerRow[];
  links?: { next?: string };
}

export interface StickerPickerAttrs extends ComponentAttrs {
  onInsert: (text: string) => void;
  onClose: () => void;
  /** Botão que abriu o picker. */
  triggerBtn?: HTMLElement | null;
}

// O picker é desmontado e recriado a cada abertura; o cache evita paginar o
// /stickers inteiro de novo a cada vez. Stickers são do fórum (não do ator),
// então o cache no módulo é seguro. O TTL curto traz edições feitas em outra
// aba sem recarregar a página.
const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache: Catalog | null = null;
let catalogCachedAt = 0;
let catalogInFlight: Promise<Catalog> | null = null; // aberturas simultâneas dividem a mesma requisição

/**
 * Agrupa as linhas do JSON:API por categoria, na ordem salva no admin.
 */
function buildCatalog(collected: StickerRow[]): Catalog {
  const baseUrl = app.forum.attribute<string>('baseUrl');

  const stickers: PickerSticker[] = collected.map((item) => {
    const path = item.attributes.path || '';
    return {
      id: item.id,
      name: item.attributes.title,
      textToReplace: item.attributes.textToReplace,
      url: urlChecker(path) ? path : baseUrl + path,
      category: item.attributes.category,
      categoryName: item.attributes.categoryName,
      isLottie: isLottiePath(path),
      isTgs: isTgsPath(path),
    };
  });

  // Sem protótipo: uma categoria chamada "constructor" ou "__proto__" não
  // pode cair num método de Object.
  let byCategory = stickers.reduce<Record<string, PickerSticker[]>>((acc, s) => {
    const cat = s.category || 'default';
    (acc[cat] = acc[cat] || []).push(s);
    return acc;
  }, Object.create(null));

  const savedOrder: string[] = (() => {
    try {
      return JSON.parse(app.forum.attribute<string>('ramonStickersCategoryOrder') || '[]');
    } catch {
      return [];
    }
  })();

  const categories = Object.keys(byCategory);
  if (savedOrder.length) {
    categories.sort((a, b) => {
      const ia = savedOrder.indexOf(a);
      const ib = savedOrder.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const sorted: Record<string, PickerSticker[]> = Object.create(null);
    categories.forEach((k) => {
      sorted[k] = byCategory[k];
    });
    byCategory = sorted;
  }

  return { stickers, byCategory, categories };
}

/**
 * Percorre todas as páginas do /stickers seguindo `links.next` (um limite fixo
 * esconderia o que passasse dele). MAX_PAGES só segura um servidor em loop.
 */
function fetchCatalog(): Promise<Catalog> {
  const PAGE_SIZE = 200;
  const MAX_PAGES = 100;
  const apiUrl = app.forum.attribute<string>('apiUrl');
  const collected: StickerRow[] = [];

  const fetchPage = (offset: number, pageNumber: number): Promise<void> => {
    if (pageNumber > MAX_PAGES) return Promise.resolve();

    return app
      .request<StickerPage>({
        method: 'GET',
        url: `${apiUrl}/stickers?page[limit]=${PAGE_SIZE}&page[offset]=${offset}`,
      })
      .then((response) => {
        const rows = response.data || [];
        rows.forEach((item) => collected.push(item));

        const hasNext = !!(response.links && response.links.next);
        return hasNext && rows.length > 0 ? fetchPage(offset + rows.length, pageNumber + 1) : undefined;
      });
  };

  return fetchPage(0, 1).then(() => buildCatalog(collected));
}

/**
 * Catálogo do cache do módulo enquanto estiver fresco.
 */
function loadCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCachedAt < CATALOG_TTL_MS) {
    return Promise.resolve(catalogCache);
  }
  if (catalogInFlight) return catalogInFlight;

  catalogInFlight = fetchCatalog()
    .then((catalog) => {
      catalogCache = catalog;
      catalogCachedAt = Date.now();
      catalogInFlight = null;
      return catalog;
    })
    .catch((err) => {
      catalogInFlight = null; // a próxima abertura tenta de novo
      throw err;
    });

  return catalogInFlight;
}

/**
 * Painel flutuante de stickers.
 */
export default class StickerPicker extends Component<StickerPickerAttrs> {
  stickers: PickerSticker[] = [];
  byCategory: Record<string, PickerSticker[]> = {};
  activeCategory: string | null = null;
  loading = true;

  private outsideClickHandler!: (e: MouseEvent) => void;
  private keydownHandler!: (e: KeyboardEvent) => void;

  oncreate(vnode: Mithril.VnodeDOM<StickerPickerAttrs, this>) {
    super.oncreate(vnode);
    this.loadStickers();

    // Clique fora fecha. O botão que abriu fica de fora: o próprio clique nele
    // já alterna o picker, e fechar aqui no mousedown o reabriria no click.
    this.outsideClickHandler = (e) => {
      const target = e.target as Node;
      const trigger = this.attrs.triggerBtn;
      if (!this.element.contains(target) && !(trigger && trigger.contains(target))) {
        this.attrs.onClose();
      }
    };
    // Na captura e sem propagar: o Escape fecha só o picker, não o compositor.
    this.keydownHandler = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.attrs.onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', this.outsideClickHandler), 10);
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  onremove(vnode: Mithril.VnodeDOM<StickerPickerAttrs, this>) {
    super.onremove(vnode);
    document.removeEventListener('mousedown', this.outsideClickHandler);
    document.removeEventListener('keydown', this.keydownHandler, true);
  }

  loadStickers() {
    loadCatalog()
      .then((catalog) => {
        this.stickers = catalog.stickers;
        this.byCategory = catalog.byCategory;
        this.activeCategory = catalog.categories[0] || null;
        this.loading = false;
        m.redraw();

        requestAnimationFrame(() => this.initAnimatedStickers());
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  /**
   * No picker as animações sempre tocam só no hover, em qualquer ponto do item.
   */
  initAnimatedStickers() {
    if (!this.element) return;

    this.element.querySelectorAll<HTMLElement>('div[data-lottie-url]:not([data-lottie-loaded])').forEach((el) => {
      el.setAttribute('data-lottie-loaded', '1');
      const url = el.getAttribute('data-lottie-url');
      const hoverTarget = el.closest<HTMLElement>('.StickerItem') || el;
      if (url) renderLottie(el, url, { hoverPlay: true, hoverTarget });
    });

    this.element.querySelectorAll<HTMLElement>('div[data-tgs-url]:not([data-tgs-loaded])').forEach((el) => {
      el.setAttribute('data-tgs-loaded', '1');
      const url = el.getAttribute('data-tgs-url');
      const hoverTarget = el.closest<HTMLElement>('.StickerItem') || el;
      if (url) renderTgs(el, url, { hoverPlay: true, hoverTarget });
    });
  }

  view() {
    const categories = Object.keys(this.byCategory);
    const showTooltip = app.forum.attribute('ramonStickersShowTooltip') !== false;

    return (
      <div className="StickerPicker">
        {this.loading ? this.loadingView() : categories.length === 0 ? this.emptyView() : this.content(categories, showTooltip)}
      </div>
    );
  }

  loadingView() {
    return (
      <div className="StickerPicker-loading">
        <i className="fas fa-spinner fa-spin" />
      </div>
    );
  }

  emptyView() {
    return <div className="StickerPicker-empty">{app.translator.trans('ramon-stickers.forum.picker.no_stickers')}</div>;
  }

  content(categories: string[], showTooltip: boolean) {
    const insert = (sticker: PickerSticker) => this.attrs.onInsert(sticker.textToReplace);

    return [
      <div className="StickerPicker-tabs">
        {categories.map((cat) => (
          <button
            className={'StickerPicker-tab' + (cat === this.activeCategory ? ' active' : '')}
            onclick={(e: MouseEvent) => {
              e.preventDefault();
              this.activeCategory = cat;
              m.redraw();
              requestAnimationFrame(() => this.initAnimatedStickers());
            }}
          >
            {this.byCategory[cat][0].categoryName || cat}
          </button>
        ))}
      </div>,

      <div className="StickerPicker-grid">
        {(this.byCategory[this.activeCategory ?? ''] || []).map((sticker) => (
          // A key recria o DOM na troca de aba: sem ela, o data-lottie-loaded
          // e o canvas passariam de um sticker para outro.
          <span
            key={sticker.id}
            className={'StickerItem' + (sticker.isLottie || sticker.isTgs ? ' StickerItem--animated' : '')}
            role="button"
            tabindex={0}
            title={showTooltip ? sticker.name : undefined}
            aria-label={sticker.name || sticker.textToReplace}
            onclick={(e: MouseEvent) => {
              e.preventDefault();
              insert(sticker);
            }}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                insert(sticker);
              }
            }}
          >
            {sticker.isLottie ? (
              <div className="StickerItem-player" data-lottie-url={sticker.url} />
            ) : sticker.isTgs ? (
              <div className="StickerItem-player" data-tgs-url={sticker.url} />
            ) : (
              <img src={sticker.url} alt={sticker.name} />
            )}
          </span>
        ))}
      </div>,
    ];
  }

  onupdate(vnode: Mithril.VnodeDOM<StickerPickerAttrs, this>) {
    super.onupdate(vnode);
    this.initAnimatedStickers();
  }
}
