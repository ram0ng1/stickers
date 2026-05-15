import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { isLottiePath, isTgsPath } from '../../common/utils/stickerPath';

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
    // Paginate through every page instead of relying on a hard-coded `page[limit]=500`
    // cap. Communities with more than 500 stickers used to see the rest silently
    // hidden. PAGE_SIZE is the per-request batch — keep it reasonable so the API
    // stays responsive on shared hosts.
    const PAGE_SIZE = 200;
    // Safety cap so a runaway server response can't loop forever. 100 pages × 200
    // = 20,000 stickers, which is far beyond any realistic forum library; if a
    // forum genuinely grows past this we'd want a search-driven picker anyway.
    const MAX_PAGES = 100;
    const baseUrl = app.forum.attribute('baseUrl');
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

    fetchPage(0, 1)
      .then(() => {
        this.stickers = collected.map((item) => {
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

        this.byCategory = this.stickers.reduce((acc, s) => {
          const cat = s.category || 'default';
          (acc[cat] = acc[cat] || []).push(s);
          return acc;
        }, {});

        // Respect the admin-saved category order
        const savedOrder = (() => {
          try {
            return JSON.parse(app.forum.attribute('ramonStickersCategoryOrder') || '[]');
          } catch {
            return [];
          }
        })();

        const allCats = Object.keys(this.byCategory);
        if (savedOrder.length) {
          allCats.sort((a, b) => {
            const ia = savedOrder.indexOf(a);
            const ib = savedOrder.indexOf(b);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
          // Rebuild byCategory in sorted order
          const sorted = {};
          allCats.forEach((k) => {
            sorted[k] = this.byCategory[k];
          });
          this.byCategory = sorted;
        }

        this.activeCategory = allCats[0] || null;
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
