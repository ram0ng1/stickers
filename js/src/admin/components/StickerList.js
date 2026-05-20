import app from 'flarum/admin/app';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import Component from 'flarum/common/Component';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import EditStickerModal from './EditStickerModal';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { isLottiePath, isTgsPath, sanitizeCategoryCode } from '../../common/utils/stickerPath';
import { STICKER_ICON_PATH } from '../../common/utils/stickerIcon';

// Animated-sticker renderer: lottie-web (canvas renderer)
// import path: lottie-web/build/player/lottie_canvas
const ANIM_LIB = 'lottie-web';

function stickerSvgIcon(size = '1.5em') {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ width: size, height: size }}>
      <path d={STICKER_ICON_PATH} />
    </svg>
  );
}

/**
 * Group an array of stickers by category.
 * Returns an ordered array of { key, label, stickers }.
 */
function groupByCategory(stickers) {
  const map = new Map();

  stickers.forEach((sticker) => {
    const key = sticker.category() || '';
    const label = sticker.categoryName() || sticker.category() || '—';

    if (!map.has(key)) {
      map.set(key, { key, label, stickers: [] });
    }
    map.get(key).stickers.push(sticker);
  });

  return [...map.values()];
}

/**
 * Sort groups according to a saved order array of category keys.
 * Groups not present in the order array are appended at the end.
 */
function sortGroupsByOrder(groups, order) {
  if (!order || order.length === 0) return groups;
  return [...groups].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default class StickerList extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.activeCategory = null;
    this.renamingCategory = null;
    this.renameCode = '';
    this.renameName = '';
    this.renameLoading = false;
    this.renameError = null;

    // Saved category order (array of category keys)
    try {
      const raw = app.data.settings['ramon-stickers.category-order'];
      this.categoryOrder = raw ? JSON.parse(raw) : [];
    } catch {
      this.categoryOrder = [];
    }

    app.stickerListState.loadResults();
  }

  // ── Category ordering ─────────────────────────────────────────────────────

  /**
   * Move a category up (-1) or down (+1) within the current sorted list.
   * Persists immediately via the API.
   */
  moveCategory(key, direction, sortedGroups) {
    const keys = sortedGroups.map((g) => g.key);
    const idx = keys.indexOf(key);
    const newIdx = idx + direction;

    if (idx === -1 || newIdx < 0 || newIdx >= keys.length) return;

    // Capture the current order so we can roll back if the server rejects it.
    const previousOrder = this.categoryOrder;

    // Optimistic swap
    [keys[idx], keys[newIdx]] = [keys[newIdx], keys[idx]];

    this.categoryOrder = keys;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/stickers/category-order',
        body: { order: keys },
      })
      .catch((err) => {
        // Roll back the optimistic reorder and tell the user. Silently
        // swallowing the error left the UI showing an order the server never
        // persisted — it would silently revert on the next page load.
        console.error('[Stickers] Category reorder failed:', err);
        this.categoryOrder = previousOrder;
        m.redraw();
        app.alerts.show(Alert, { type: 'error' }, app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.move_category_error'));
      });
  }

  startRename(group) {
    this.renamingCategory = group.key;
    this.renameCode = group.key;
    this.renameName = group.label !== '—' ? group.label : group.key;
    this.renameError = null;
    m.redraw();
  }

  cancelRename() {
    this.renamingCategory = null;
    this.renameError = null;
    m.redraw();
  }

  saveRename(oldKey) {
    const newCode = sanitizeCategoryCode(this.renameCode);
    const newName = this.renameName.trim() || newCode;

    if (!newCode) {
      this.renameError = 'Category code cannot be empty.';
      m.redraw();
      return;
    }

    this.renameLoading = true;
    this.renameError = null;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/stickers/rename-category',
        body: { oldCategory: oldKey, newCategory: newCode, newCategoryName: newName },
      })
      .then(() => {
        this.renamingCategory = null;
        this.renameLoading = false;
        // If the renamed category was the active filter, follow the new key
        if (this.activeCategory === oldKey) this.activeCategory = newCode;
        app.stickerListState.stickers = [];
        app.stickerListState.loadResults();
      })
      .catch((err) => {
        this.renameLoading = false;
        this.renameError = err?.response?.errors?.[0]?.detail || 'Rename failed.';
        m.redraw();
      });
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.initAnimatedPreviews();
  }

  onupdate(vnode) {
    super.onupdate(vnode);
    this.initAnimatedPreviews();
  }

  /**
   * Initialize lottie/tgs previews in the list.
   * Uses lottie-web (canvas renderer) — see ANIM_LIB constant above.
   * Hover-to-play: animation shows first frame at rest, plays on mouse over.
   */
  initAnimatedPreviews() {
    if (!this.element) return;

    // Lottie JSON previews — rendered via lottie-web canvas renderer
    this.element.querySelectorAll('div[data-lottie-url]:not([data-lottie-loaded])').forEach((el) => {
      el.setAttribute('data-lottie-loaded', '1');
      const url = el.getAttribute('data-lottie-url');
      const hoverTarget = el.closest('.customSticker') || el;
      if (url) renderLottie(el, url, { hoverPlay: true, hoverTarget });
    });

    // TGS previews — decompressed gzip + rendered via lottie-web canvas renderer
    this.element.querySelectorAll('div[data-tgs-url]:not([data-tgs-loaded])').forEach((el) => {
      el.setAttribute('data-tgs-loaded', '1');
      const url = el.getAttribute('data-tgs-url');
      const hoverTarget = el.closest('.customSticker') || el;
      if (url) renderTgs(el, url, { hoverPlay: true, hoverTarget });
    });
  }

  getStickerUrl(path) {
    if (!path) return '';
    return urlChecker(path) ? path : app.forum.attribute('baseUrl') + path;
  }

  /**
   * Render a single sticker card (shared between category groups).
   */
  stickerCard(sticker) {
    const state = app.stickerListState;
    const selecting = state.selectionMode;
    const path = sticker.path() || '';
    const url = this.getStickerUrl(path);
    const isLottie = isLottiePath(path);
    const isTgs = isTgsPath(path);
    const selected = selecting && state.isSelected(sticker.id());

    return (
      <li key={sticker.id()}>
        <div className={'customSticker' + (selected ? ' is-selected' : '')} onclick={selecting ? () => state.toggleSelect(sticker.id()) : null}>
          {/* Selection indicator (only in selection mode) */}
          {selecting && (
            <div className={'customSticker-selectMark' + (selected ? ' is-selected' : '')}>
              <i className={'fas fa-' + (selected ? 'check-circle' : 'circle')} />
            </div>
          )}

          {/* Edit button (hidden in selection mode) */}
          {!selecting && (
            <Button
              className="Button Button--icon customSticker-editButton"
              icon="fas fa-pencil-alt"
              onclick={() => app.modal.show(EditStickerModal, { model: sticker })}
            />
          )}

          <div className="customSticker-imageWrapper">
            {isLottie ? (
              <div data-lottie-url={url} className="customSticker-player" title={sticker.textToReplace()} />
            ) : isTgs ? (
              <div data-tgs-url={url} className="customSticker-player" title={sticker.textToReplace()} />
            ) : (
              <img src={url} className="customSticker-image" alt={sticker.title()} title={sticker.textToReplace()} />
            )}
          </div>

          <div className="customSticker-title">
            <h4>{sticker.title()}</h4>
          </div>
        </div>
      </li>
    );
  }

  view() {
    const state = app.stickerListState;
    const selecting = state.selectionMode;
    const allGroups = sortGroupsByOrder(groupByCategory(state.stickers), this.categoryOrder);

    // Filter groups by active category tab (null = show all)
    const visibleGroups = this.activeCategory === null ? allGroups : allGroups.filter((g) => g.key === this.activeCategory);

    return (
      <div className={'sticker-list' + (selecting ? ' StickerList--selecting' : '')}>
        {state.isLoading() && state.stickers.length === 0 ? <LoadingIndicator display="unset" size="large" /> : ''}

        {/* Add sticker button — always at the top, above all categories */}
        {!selecting && (
          <button className="StickerAddButton" onclick={() => app.modal.show(EditStickerModal)}>
            <span className="StickerAddButton-icon">{stickerSvgIcon('1.1em')}</span>
            <span className="StickerAddButton-label">Add sticker</span>
          </button>
        )}

        {/* Category filter tabs — only when more than one category exists */}
        {allGroups.length > 1 && (
          <div className="StickerCategoryFilter">
            <button
              className={'StickerCategoryFilter-tab' + (this.activeCategory === null ? ' active' : '')}
              onclick={() => {
                this.activeCategory = null;
                m.redraw();
              }}
            >
              All
              <span className="StickerCategoryFilter-count">{state.stickers.length}</span>
            </button>

            {allGroups.map((group) => (
              <button
                key={group.key}
                className={'StickerCategoryFilter-tab' + (this.activeCategory === group.key ? ' active' : '')}
                onclick={() => {
                  this.activeCategory = group.key;
                  m.redraw();
                }}
              >
                {group.label}
                <span className="StickerCategoryFilter-count">{group.stickers.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Category groups (filtered) */}
        {visibleGroups.map((group) => (
          <div key={group.key} className="StickerCategory">
            {this.renamingCategory === group.key ? (
              /* ── Inline rename form ── */
              <div className="StickerCategory-renameForm">
                <div className="StickerCategory-renameFields">
                  <input
                    className="FormControl FormControl--small"
                    placeholder="category_code"
                    value={this.renameCode}
                    oninput={(e) => {
                      this.renameCode = e.target.value;
                    }}
                  />
                  <input
                    className="FormControl FormControl--small"
                    placeholder="Display name"
                    value={this.renameName}
                    oninput={(e) => {
                      this.renameName = e.target.value;
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') this.saveRename(group.key);
                      if (e.key === 'Escape') this.cancelRename();
                    }}
                  />
                </div>

                {this.renameError && <p className="StickerCategory-renameError">{this.renameError}</p>}

                <div className="StickerCategory-renameActions">
                  <Button
                    className="Button Button--primary Button--sm"
                    loading={this.renameLoading}
                    disabled={this.renameLoading}
                    onclick={() => this.saveRename(group.key)}
                  >
                    Save
                  </Button>
                  <Button className="Button Button--sm" disabled={this.renameLoading} onclick={() => this.cancelRename()}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Normal header ── */
              <div className="StickerCategory-header">
                <h3>{group.label}</h3>
                <span className="StickerCategory-header-count">{group.stickers.length}</span>

                {!selecting && this.activeCategory === null && (
                  <span className="StickerCategory-orderBtns">
                    <button
                      className="StickerCategory-orderBtn"
                      title="Move up"
                      disabled={visibleGroups.indexOf(group) === 0}
                      onclick={() => this.moveCategory(group.key, -1, visibleGroups)}
                    >
                      <i className="fas fa-chevron-up" />
                    </button>
                    <button
                      className="StickerCategory-orderBtn"
                      title="Move down"
                      disabled={visibleGroups.indexOf(group) === visibleGroups.length - 1}
                      onclick={() => this.moveCategory(group.key, 1, visibleGroups)}
                    >
                      <i className="fas fa-chevron-down" />
                    </button>
                  </span>
                )}

                {!selecting && (
                  <button className="StickerCategory-renameBtn" title="Rename category" onclick={() => this.startRename(group)}>
                    <i className="fas fa-pencil-alt" />
                  </button>
                )}
              </div>
            )}

            <ul className="StickerCategory-grid">{group.stickers.map((sticker) => this.stickerCard(sticker))}</ul>
          </div>
        ))}

        {state.hasMoreResults() && !selecting && (
          <div className="sticker-loadMore">
            <Button className="Button Button--primary" disabled={state.isLoading()} loading={state.isLoading()} onclick={() => state.loadMore()}>
              {app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.load_more_button')}
            </Button>
          </div>
        )}

        {/* Library attribution — shown at the bottom of the list */}
        {state.stickers.some((s) => {
          const p = s.path() || '';
          return p.endsWith('.json') || p.endsWith('.tgs');
        }) && (
          <p className="StickerList-animLib">
            <i className="fas fa-info-circle" /> Animated previews rendered via <strong>{ANIM_LIB}</strong>{' '}
            <span className="StickerList-animLib-detail">(canvas renderer)</span>
          </p>
        )}
      </div>
    );
  }
}
