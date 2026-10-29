import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { isLottiePath, isTgsPath } from '../../common/utils/stickerPath';

// O picker é desmontado e recriado a cada abertura; o cache evita paginar o
// /stickers inteiro de novo a cada vez. Stickers são do fórum (não do ator),
// então o cache no módulo é seguro. O TTL curto traz edições feitas em outra
// aba sem recarregar a página.
const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache = null; // { stickers, byCategory, categories }
let catalogCachedAt = 0;
let catalogInFlight = null; // aberturas simultâneas dividem a mesma requisição

/**
 * Agrupa as linhas do JSON:API por categoria, na ordem salva no admin.
 */
function buildCatalog(collected) {
  const baseUrl = app.forum.attribute('baseUrl');

  const stickers = collected.map((item) => {
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
  let byCategory = stickers.reduce((acc, s) => {
    const cat = s.category || 'default';
    (acc[cat] = acc[cat] || []).push(s);
    return acc;
  }, Object.create(null));

  const savedOrder = (() => {
    try {
      return JSON.parse(app.forum.attribute('ramonStickersCategoryOrder') || '[]');
    } catch {
      return [];
    }
  })();

  let categories = Object.keys(byCategory);
  if (savedOrder.length) {
    categories.sort((a, b) => {
      const ia = savedOrder.indexOf(a);
      const ib = savedOrder.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const sorted = Object.create(null);
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
function fetchCatalog() {
  const PAGE_SIZE = 200;
  const MAX_PAGES = 100;
  const apiUrl = app.forum.attribute('apiUrl');
  const collected = [];

  const fetchPage = (offset, pageNumber) => {
    if (pageNumber > MAX_PAGES) return Promise.resolve();

    return app
      .request({
        method: 'GET',
        url: `${apiUrl}/stickers?page[limit]=${PAGE_SIZE}&page[offset]=${offset}`,
      })
      .then((response) => {
        const rows = response.data || [];
        rows.forEach((item) => collected.push(item));

        const hasNext = !!(response.links && response.links.next);
        if (hasNext && rows.length > 0) {
          return fetchPage(offset + rows.length, pageNumber + 1);
        }
      });
  };

  return fetchPage(0, 1).then(() => buildCatalog(collected));
}

/**
 * Catálogo do cache do módulo enquanto estiver fresco.
 */
function loadCatalog() {
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
 *
 * @attr {function}    onInsert    recebe o text_to_replace escolhido
 * @attr {function}    onClose     pede para fechar
 * @attr {HTMLElement} [triggerBtn] botão que abriu o picker
 */
export default class StickerPicker extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.stickers = [];
    this.byCategory = {};
    this.activeCategory = null;
    this.loading = true;
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.loadStickers();

    // Clique fora fecha. O botão que abriu fica de fora: o próprio clique nele
    // já alterna o picker, e fechar aqui no mousedown o reabria no click.
    this._outsideClickHandler = (e) => {
      const trigger = this.attrs.triggerBtn;
      if (!this.element.contains(e.target) && !(trigger && trigger.contains(e.target))) {
        this.attrs.onClose();
      }
    };
    this._keydownHandler = (e) => {
      if (e.key === 'Escape') this.attrs.onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', this._outsideClickHandler), 10);
    document.addEventListener('keydown', this._keydownHandler);
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('mousedown', this._outsideClickHandler);
    document.removeEventListener('keydown', this._keydownHandler);
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

    this.element.querySelectorAll('div[data-lottie-url]:not([data-lottie-loaded])').forEach((el) => {
      el.setAttribute('data-lottie-loaded', '1');
      const url = el.getAttribute('data-lottie-url');
      const hoverTarget = el.closest('.StickerItem') || el;
      if (url) renderLottie(el, url, { hoverPlay: true, hoverTarget });
    });

    this.element.querySelectorAll('div[data-tgs-url]:not([data-tgs-loaded])').forEach((el) => {
      el.setAttribute('data-tgs-loaded', '1');
      const url = el.getAttribute('data-tgs-url');
      const hoverTarget = el.closest('.StickerItem') || el;
      if (url) renderTgs(el, url, { hoverPlay: true, hoverTarget });
    });
  }

  view() {
    const categories = Object.keys(this.byCategory);
    const showTooltip = app.forum.attribute('ramonStickersShowTooltip') !== false;

    return m('div.StickerPicker', [
      this.loading
        ? m('div.StickerPicker-loading', m('i.fas.fa-spinner.fa-spin'))
        : categories.length === 0
          ? m('div.StickerPicker-empty', app.translator.trans('ramon-stickers.forum.picker.no_stickers'))
          : [
              m(
                'div.StickerPicker-tabs',
                categories.map((cat) =>
                  m(
                    'button.StickerPicker-tab' + (cat === this.activeCategory ? '.active' : ''),
                    {
                      onclick: (e) => {
                        e.preventDefault();
                        this.activeCategory = cat;
                        m.redraw();
                        requestAnimationFrame(() => this.initAnimatedStickers());
                      },
                    },
                    this.byCategory[cat][0].categoryName || cat
                  )
                )
              ),

              m(
                'div.StickerPicker-grid',
                (this.byCategory[this.activeCategory] || []).map((sticker) =>
                  m(
                    'span.StickerItem' + (sticker.isLottie || sticker.isTgs ? '.StickerItem--animated' : ''),
                    {
                      // A key recria o DOM na troca de aba: sem ela, o data-lottie-loaded
                      // e o canvas passavam de um sticker para outro.
                      key: sticker.id,
                      role: 'button',
                      tabindex: 0,
                      title: showTooltip ? sticker.name : undefined,
                      'aria-label': sticker.name || sticker.textToReplace,
                      onclick: (e) => {
                        e.preventDefault();
                        this.attrs.onInsert(sticker.textToReplace);
                      },
                      onkeydown: (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          this.attrs.onInsert(sticker.textToReplace);
                        }
                      },
                    },
                    sticker.isLottie
                      ? m('div.StickerItem-player', { 'data-lottie-url': sticker.url })
                      : sticker.isTgs
                        ? m('div.StickerItem-player', { 'data-tgs-url': sticker.url })
                        : m('img', { src: sticker.url, alt: sticker.name })
                  )
                )
              ),
            ],
    ]);
  }

  onupdate(vnode) {
    super.onupdate(vnode);
    this.initAnimatedStickers();
  }
}
