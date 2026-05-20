import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { isLottiePath, isTgsPath } from '../../common/utils/stickerPath';

// ── Module-level catalog cache ──────────────────────────────────────────────
// The picker is destroyed and re-created (m.mount) every time it opens, so
// without a cache every open re-paginated the whole /stickers endpoint — 5-10
// sequential requests on a large forum, on every single open. Stickers are
// GLOBAL forum content (not actor-specific), so caching them at module scope
// is safe — CLAUDE.md §27's module-state warning is specifically about
// per-actor data. A short TTL lets sticker edits made elsewhere propagate into
// a long-lived single-page session without a full reload.
const CATALOG_TTL_MS = 5 * 60 * 1000;
let catalogCache = null; // { stickers, byCategory, categories }
let catalogCachedAt = 0;
let catalogInFlight = null; // dedupes concurrent opens before the first fetch resolves

/**
 * Shape the raw JSON:API rows into the structure the view consumes, grouped
 * and ordered by category.
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

  let byCategory = stickers.reduce((acc, s) => {
    const cat = s.category || 'default';
    (acc[cat] = acc[cat] || []).push(s);
    return acc;
  }, {});

  // Respect the admin-saved category order.
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
    // Rebuild byCategory in sorted order.
    const sorted = {};
    categories.forEach((k) => {
      sorted[k] = byCategory[k];
    });
    byCategory = sorted;
  }

  return { stickers, byCategory, categories };
}

/**
 * Paginate through every page of the /stickers endpoint and build the catalog.
 * Hard-coded `page[limit]` caps silently hide stickers beyond the cap, so we
 * follow `links.next` instead. MAX_PAGES is a runaway-server safety stop.
 */
function fetchCatalog() {
  const PAGE_SIZE = 200;
  const MAX_PAGES = 100; // 100 × 200 = 20,000 stickers — far beyond any realistic library.
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
 * Return the sticker catalog, served from the module cache when fresh.
 * Concurrent callers share a single in-flight request.
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
      catalogInFlight = null; // allow a retry on the next open
      throw err;
    });

  return catalogInFlight;
}

/**
 * The StickerPicker component renders the floating sticker panel.
 *
 * @attr {function} onInsert   called with text_to_replace string
 * @attr {function} onClose    called when picker should close
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

    // Close when clicking outside
    this._outsideClickHandler = (e) => {
      if (!this.element.contains(e.target)) {
        this.attrs.onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', this._outsideClickHandler), 10);
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('mousedown', this._outsideClickHandler);
  }

  loadStickers() {
    // Served from the module-level cache when fresh — see loadCatalog() above.
    // The picker no longer hits the API on every open.
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
   * Initialize animated stickers.
   * The picker ALWAYS uses hover-to-play (better UX for browsing stickers).
   * hoverTarget = the outer .StickerItem span so hovering anywhere on it triggers play.
   */
  initAnimatedStickers() {
    if (!this.element) return;

    // Lottie JSON
    this.element.querySelectorAll('div[data-lottie-url]:not([data-lottie-loaded])').forEach((el) => {
      el.setAttribute('data-lottie-loaded', '1');
      const url = el.getAttribute('data-lottie-url');
      const hoverTarget = el.closest('.StickerItem') || el;
      if (url) renderLottie(el, url, { hoverPlay: true, hoverTarget });
    });

    // TGS
    this.element.querySelectorAll('div[data-tgs-url]:not([data-tgs-loaded])').forEach((el) => {
      el.setAttribute('data-tgs-loaded', '1');
      const url = el.getAttribute('data-tgs-url');
      const hoverTarget = el.closest('.StickerItem') || el;
      if (url) renderTgs(el, url, { hoverPlay: true, hoverTarget });
    });
  }

  /**
   * Returns true when the hover-play forum setting is enabled.
   * Used to show a small visual hint in the picker tab.
   */
  get hoverPlayEnabled() {
    return !!app.forum.attribute('ramonStickersHoverPlay');
  }

  view() {
    const categories = Object.keys(this.byCategory);

    return m('div.StickerPicker', [
      this.loading
        ? m('div.StickerPicker-loading', m('i.fas.fa-spinner.fa-spin'))
        : categories.length === 0
          ? m('div.StickerPicker-empty', app.translator.trans('ramon-stickers.forum.picker.no_stickers'))
          : [
              // Tab bar
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

              // Sticker grid
              m(
                'div.StickerPicker-grid',
                (this.byCategory[this.activeCategory] || []).map((sticker) =>
                  m(
                    'span.StickerItem' + (sticker.isLottie || sticker.isTgs ? '.StickerItem--animated' : ''),
                    {
                      // key ensures Mithril creates fresh DOM elements on tab switch,
                      // preventing data-lottie-loaded / canvas leakage between stickers
                      key: sticker.id,
                      onclick: (e) => {
                        e.preventDefault();
                        this.attrs.onInsert(sticker.textToReplace);
                      },
                    },
                    sticker.isLottie
                      ? // Lottie JSON: container div — lottie-web creates <canvas> inside it
                        m('div.StickerItem-player', { 'data-lottie-url': sticker.url })
                      : sticker.isTgs
                        ? // TGS: same pattern
                          m('div.StickerItem-player', { 'data-tgs-url': sticker.url })
                        : // Static image
                          m('img', { src: sticker.url, alt: sticker.name })
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
