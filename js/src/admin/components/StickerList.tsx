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
import type Sticker from '../../common/models/Sticker';

import type Mithril from 'mithril';

interface StickerGroup {
  key: string;
  label: string;
  stickers: Sticker[];
}

function stickerSvgIcon(size = '1.5em') {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ width: size, height: size }}>
      <path d={STICKER_ICON_PATH} />
    </svg>
  );
}

/**
 * Agrupa por categoria: [{ key, label, stickers }].
 */
function groupByCategory(stickers: Sticker[]): StickerGroup[] {
  const map = new Map<string, StickerGroup>();

  stickers.forEach((sticker) => {
    const key = sticker.category() || '';
    const label = sticker.categoryName() || sticker.category() || '—';

    if (!map.has(key)) {
      map.set(key, { key, label, stickers: [] });
    }
    map.get(key)!.stickers.push(sticker);
  });

  return [...map.values()];
}

/**
 * Ordena os grupos pela ordem salva; os que não estão nela vão para o fim.
 */
function sortGroupsByOrder(groups: StickerGroup[], order: string[]): StickerGroup[] {
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
  activeCategory: string | null = null;
  renamingCategory: string | null = null;
  renameCode = '';
  renameName = '';
  renameLoading = false;
  renameError: string | null = null;
  categoryOrder: string[] = [];

  oninit(vnode: Mithril.Vnode<any, this>) {
    super.oninit(vnode);

    try {
      const raw = app.data.settings['ramon-stickers.category-order'];
      this.categoryOrder = raw ? JSON.parse(raw) : [];
    } catch {
      this.categoryOrder = [];
    }

    app.stickerListState.loadResults();
  }

  /**
   * Move a categoria para cima (-1) ou para baixo (+1) e salva na hora.
   */
  moveCategory(key: string, direction: number, sortedGroups: StickerGroup[]) {
    const keys = sortedGroups.map((g) => g.key);
    const idx = keys.indexOf(key);
    const newIdx = idx + direction;

    if (idx === -1 || newIdx < 0 || newIdx >= keys.length) return;

    const previousOrder = this.categoryOrder;

    [keys[idx], keys[newIdx]] = [keys[newIdx], keys[idx]];

    // Categorias salvas que ainda não carregaram (estão em páginas seguintes da
    // lista) continuam na ordem, depois das visíveis.
    const order = [...keys, ...previousOrder.filter((key) => !keys.includes(key))];

    this.categoryOrder = order;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/stickers/category-order',
        body: { order },
        errorHandler: (error) => {
          throw error;
        },
      })
      .then(() => {
        // O oninit lê daqui ao voltar para a página.
        app.data.settings['ramon-stickers.category-order'] = JSON.stringify(order);
      })
      .catch((err) => {
        console.error('[Stickers] Category reorder failed:', err);
        this.categoryOrder = previousOrder;
        m.redraw();
        app.alerts.show(Alert, { type: 'error' }, app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.move_category_error'));
      });
  }

  startRename(group: StickerGroup) {
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

  saveRename(oldKey: string) {
    const newCode = sanitizeCategoryCode(this.renameCode);
    const newName = this.renameName.trim() || newCode;

    if (!newCode) {
      this.renameError = app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_empty_error', {}, true);
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
        if (this.activeCategory === oldKey) this.activeCategory = newCode;

        // O servidor troca o código na ordem salva; aqui também.
        if (oldKey !== newCode && this.categoryOrder.includes(oldKey)) {
          this.categoryOrder = [...new Set(this.categoryOrder.map((key) => (key === oldKey ? newCode : key)))];
          app.data.settings['ramon-stickers.category-order'] = JSON.stringify(this.categoryOrder);
        }

        app.stickerListState.loadResults();
      })
      .catch((err) => {
        this.renameLoading = false;
        this.renameError =
          err?.response?.errors?.[0]?.detail || app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_error', {}, true);
        m.redraw();
      });
  }

  oncreate(vnode: Mithril.VnodeDOM<any, this>) {
    super.oncreate(vnode);
    this.initAnimatedPreviews();
  }

  onupdate(vnode: Mithril.VnodeDOM<any, this>) {
    super.onupdate(vnode);
    this.initAnimatedPreviews();
  }

  /**
   * Prévias Lottie/TGS da lista: paradas no 1º quadro, tocam no hover.
   */
  initAnimatedPreviews() {
    if (!this.element) return;

    this.element.querySelectorAll<HTMLElement>('div[data-lottie-url]:not([data-lottie-loaded])').forEach((el) => {
      el.setAttribute('data-lottie-loaded', '1');
      const url = el.getAttribute('data-lottie-url');
      const hoverTarget = el.closest<HTMLElement>('.customSticker') || el;
      if (url) renderLottie(el, url, { hoverPlay: true, hoverTarget });
    });

    this.element.querySelectorAll<HTMLElement>('div[data-tgs-url]:not([data-tgs-loaded])').forEach((el) => {
      el.setAttribute('data-tgs-loaded', '1');
      const url = el.getAttribute('data-tgs-url');
      const hoverTarget = el.closest<HTMLElement>('.customSticker') || el;
      if (url) renderTgs(el, url, { hoverPlay: true, hoverTarget });
    });
  }

  getStickerUrl(path: string): string {
    if (!path) return '';
    return urlChecker(path) ? path : app.forum.attribute('baseUrl') + path;
  }

  /**
   * Card de um sticker.
   */
  stickerCard(sticker: Sticker) {
    const state = app.stickerListState;
    const selecting = state.selectionMode;
    const path = sticker.path() || '';
    const url = this.getStickerUrl(path);
    const isLottie = isLottiePath(path);
    const isTgs = isTgsPath(path);
    const id = sticker.id() as string;
    const selected = selecting && state.isSelected(id);

    return (
      <li key={sticker.id()}>
        <div className={'customSticker' + (selected ? ' is-selected' : '')} onclick={selecting ? () => state.toggleSelect(id) : null}>
          {selecting && (
            <div className={'customSticker-selectMark' + (selected ? ' is-selected' : '')}>
              <i className={'fas fa-' + (selected ? 'check-circle' : 'circle')} />
            </div>
          )}

          {!selecting && (
            <Button
              className="Button Button--icon customSticker-editButton"
              icon="fas fa-pencil-alt"
              aria-label={app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.edit_button')}
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

    // activeCategory null = todas.
    const visibleGroups = this.activeCategory === null ? allGroups : allGroups.filter((g) => g.key === this.activeCategory);

    return (
      <div className={'sticker-list' + (selecting ? ' StickerList--selecting' : '')}>
        {state.isLoading() && state.stickers.length === 0 ? <LoadingIndicator display="unset" size="large" /> : ''}

        {!selecting && (
          <button className="StickerAddButton" onclick={() => app.modal.show(EditStickerModal)}>
            <span className="StickerAddButton-icon">{stickerSvgIcon('1.1em')}</span>
            <span className="StickerAddButton-label">{app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.add_button')}</span>
          </button>
        )}

        {allGroups.length > 1 && (
          <div className="StickerCategoryFilter">
            <button
              className={'StickerCategoryFilter-tab' + (this.activeCategory === null ? ' active' : '')}
              onclick={() => {
                this.activeCategory = null;
                m.redraw();
              }}
            >
              {app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.all_tab')}
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

        {visibleGroups.map((group) => (
          <div key={group.key} className="StickerCategory">
            {this.renamingCategory === group.key ? (
              <div className="StickerCategory-renameForm">
                <div className="StickerCategory-renameFields">
                  <input
                    className="FormControl FormControl--small"
                    placeholder={app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_code_placeholder', {}, true)}
                    value={this.renameCode}
                    oninput={(e: InputEvent) => {
                      this.renameCode = (e.target as HTMLInputElement).value;
                    }}
                  />
                  <input
                    className="FormControl FormControl--small"
                    placeholder={app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_name_placeholder', {}, true)}
                    value={this.renameName}
                    oninput={(e: InputEvent) => {
                      this.renameName = (e.target as HTMLInputElement).value;
                    }}
                    onkeydown={(e: KeyboardEvent) => {
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
                    {app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_save_button')}
                  </Button>
                  <Button className="Button Button--sm" disabled={this.renameLoading} onclick={() => this.cancelRename()}>
                    {app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_cancel_button')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="StickerCategory-header">
                <h3>{group.label}</h3>
                <span className="StickerCategory-header-count">{group.stickers.length}</span>

                {!selecting && this.activeCategory === null && (
                  <span className="StickerCategory-orderBtns">
                    <button
                      className="StickerCategory-orderBtn"
                      title={app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.move_up', {}, true)}
                      disabled={visibleGroups.indexOf(group) === 0}
                      onclick={() => this.moveCategory(group.key, -1, visibleGroups)}
                    >
                      <i className="fas fa-chevron-up" />
                    </button>
                    <button
                      className="StickerCategory-orderBtn"
                      title={app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.move_down', {}, true)}
                      disabled={visibleGroups.indexOf(group) === visibleGroups.length - 1}
                      onclick={() => this.moveCategory(group.key, 1, visibleGroups)}
                    >
                      <i className="fas fa-chevron-down" />
                    </button>
                  </span>
                )}

                {/* O grupo sem categoria (código vazio) não tem o que renomear: o servidor recusa. */}
                {!selecting && group.key !== '' && (
                  <button
                    className="StickerCategory-renameBtn"
                    title={app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.rename_button', {}, true)}
                    onclick={() => this.startRename(group)}
                  >
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

        {state.stickers.some((s) => {
          const p = s.path() || '';
          return p.endsWith('.json') || p.endsWith('.tgs');
        }) && (
          <p className="StickerList-animLib">
            <i className="fas fa-info-circle" />{' '}
            {app.translator.trans('ramon-stickers.admin.sticker_section.sticker_list.anim_lib', {
              strong: <strong />,
              detail: <span className="StickerList-animLib-detail" />,
            })}
          </p>
        )}
      </div>
    );
  }
}
