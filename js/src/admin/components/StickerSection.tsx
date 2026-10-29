import app from 'flarum/admin/app';
import { saveAs } from 'file-saver';
import { emojiToCode, emojiToTitle } from '../../common/utils/emojiFilename';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import Switch from 'flarum/common/components/Switch';
import Component from 'flarum/common/Component';
import ItemList from 'flarum/common/utils/ItemList';
import listItems from 'flarum/common/helpers/listItems';
import saveSettings from 'flarum/admin/utils/saveSettings';
import StickerList from './StickerList';
import { sanitizeCategoryCode } from '../../common/utils/stickerPath';
import uploadStickerFile, { UploadError } from '../utils/uploadStickerFile';

import type Mithril from 'mithril';

// Espera entre tentativas quando o limite de envios (UploadThrottler) responde 429.
const THROTTLE_RETRY_MS = 5000;
const THROTTLE_MAX_RETRIES = 15;

interface ImportState {
  active: boolean;
  imported: number;
  skipped: number;
  total: number;
  error: string | null;
}

interface UploadState {
  active: boolean;
  current: number;
  total: number;
  errors: number;
}

interface ImportResponse {
  imported: number;
  skipped: number;
  total: number;
}

type SwitchProp = 'hoverPlayEnabled' | 'showTooltipEnabled';
type SavingProp = 'savingHoverPlay' | 'savingShowTooltip';

export default class StickerSection extends Component {
  hoverPlayEnabled = false;
  showTooltipEnabled = true;
  savingHoverPlay = false;
  savingShowTooltip = false;
  exporting = false;
  importState: ImportState | null = null;
  uploadState: UploadState | null = null;
  deletingSelected = false;

  oninit(vnode: Mithril.Vnode<any, this>) {
    super.oninit(vnode);

    const settings = app.data.settings as Record<string, unknown>;
    this.hoverPlayEnabled = ['1', true].includes(settings['ramon-stickers.hover-play'] as string | boolean);
    this.showTooltipEnabled = !['0', false].includes(settings['ramon-stickers.show-tooltip'] as string | boolean);
  }

  exportStickerList() {
    if (this.exporting) return;
    this.exporting = true;
    m.redraw();

    // fetch() puro: o ZIP vem como stream binário e o app.request() tentaria
    // ler JSON.
    fetch(app.forum.attribute('apiUrl') + '/stickers/export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': app.session.csrfToken },
    })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename\s*=\s*"?([^"]+)"?/i);
        const filename = match ? match[1] : `stickers-${new Date().toISOString().slice(0, 10)}.zip`;

        return response.blob().then((blob) => saveAs(blob, filename));
      })
      .catch((err) => {
        console.error('[Stickers] Export failed:', err);
        alert(app.translator.trans('ramon-stickers.admin.sticker_section.export_error', {}, true));
      })
      .then(() => {
        this.exporting = false;
        m.redraw();
      });
  }

  importStickerList() {
    if (this.importState?.active) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.zip')) {
        this.importZip(file);
      } else if (file.name.toLowerCase().endsWith('.json')) {
        this.importLegacyJson(file);
      }
    };

    input.click();
  }

  importZip(file: File) {
    if (!confirm(app.translator.trans('ramon-stickers.admin.sticker_section.import_zip_message', {}, true))) return;

    this.importState = { active: true, imported: 0, skipped: 0, total: 0, error: null };
    app.stickerListState.loading = true;
    m.redraw();

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', app.forum.attribute('apiUrl') + '/stickers/import');
    xhr.setRequestHeader('X-CSRF-Token', app.session.csrfToken);
    xhr.withCredentials = true;

    xhr.onload = () => {
      app.stickerListState.loading = false;

      // A resposta pode não ser JSON (fatal do PHP, 502 do proxy): mostra o
      // trecho em vez de quebrar calado. Qualquer status fora de 2xx é erro.
      let data;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (e) {
        const snippet = (xhr.responseText || '').slice(0, 200);
        this.importState = {
          active: false,
          imported: 0,
          skipped: 0,
          total: 0,
          error: app.translator.trans('ramon-stickers.admin.sticker_section.import_unreadable_response', { status: xhr.status, snippet }, true),
        };
        m.redraw();
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300 || data.error) {
        this.importState = {
          active: false,
          imported: 0,
          skipped: 0,
          total: 0,
          error: data.error || data.errors?.[0]?.detail || 'HTTP ' + xhr.status,
        };
        m.redraw();
        return;
      }

      this.importState = { active: false, imported: data.imported, skipped: data.skipped, total: data.total, error: null };
      m.redraw();

      app.stickerListState.loadResults();

      setTimeout(() => {
        this.importState = null;
        m.redraw();
      }, 6000);
    };

    xhr.onerror = () => {
      this.importState = {
        active: false,
        imported: 0,
        skipped: 0,
        total: 0,
        error: app.translator.trans('ramon-stickers.admin.sticker_section.network_error', {}, true),
      };
      app.stickerListState.loading = false;
      m.redraw();
    };

    xhr.send(formData);
  }

  importLegacyJson(file: File) {
    if (!confirm(app.translator.trans('ramon-stickers.admin.sticker_section.import_stickers_message', {}, true))) return;

    this.importState = { active: true, imported: 0, skipped: 0, total: 0, error: null };
    app.stickerListState.loading = true;
    m.redraw();

    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');

    reader.onload = () => {
      // JSON quebrado para aqui; a exceção solta deixaria o spinner girando para sempre.
      let parsed: unknown;
      try {
        parsed = JSON.parse(reader.result as string);
      } catch (e) {
        this.importState = {
          active: false,
          imported: 0,
          skipped: 0,
          total: 0,
          error: app.translator.trans('ramon-stickers.admin.sticker_section.import_invalid_json', { error: (e as Error).message }, true),
        };
        app.stickerListState.loading = false;
        m.redraw();
        return;
      }

      app
        .request<ImportResponse>({
          method: 'POST',
          url: `${app.forum.attribute('apiUrl')}/stickers/import`,
          body: { data: parsed },
          // O erro aparece no aviso da seção, não num alerta a mais.
          errorHandler: (error: unknown) => {
            throw error;
          },
        })
        .then((data) => {
          this.importState = { active: false, imported: data.imported, skipped: data.skipped, total: data.total, error: null };
          app.stickerListState.loading = false;
          m.redraw();

          app.stickerListState.loadResults();

          setTimeout(() => {
            this.importState = null;
            m.redraw();
          }, 6000);
        })
        .catch((err: { message?: string; response?: { error?: string; errors?: { detail?: string }[] } }) => {
          const error = err?.response?.error || err?.response?.errors?.[0]?.detail || err?.message || String(err);
          this.importState = { active: false, imported: 0, skipped: 0, total: 0, error };
          app.stickerListState.loading = false;
          m.redraw();
        });
    };
  }

  bulkUploadFiles() {
    const defaultName = app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_default_category', {}, true);
    const categoryName = prompt(app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_category_prompt', {}, true), defaultName);
    if (categoryName === null) return;

    const category = sanitizeCategoryCode(categoryName || 'stickers') || 'stickers';
    const catLabel = categoryName || defaultName;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.tgs,.png,.gif,.webp,.jpg,.jpeg,.apng';

    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;

      this.uploadState = { active: true, current: 0, total: files.length, errors: 0 };
      m.redraw();

      this._uploadNext(files, category, catLabel, 0);
    };

    input.click();
  }

  _uploadNext(files: File[], category: string, categoryName: string, index: number): void {
    if (index >= files.length) {
      const { errors, total } = this.uploadState!;
      this.uploadState = { active: false, current: total, total, errors };
      app.stickerListState.loadResults();
      m.redraw();
      setTimeout(() => {
        this.uploadState = null;
        m.redraw();
      }, 5000);
      return;
    }

    const file = files[index];

    this._uploadWithRetry(file, 0)
      .then((path: string) =>
        app.store.createRecord('stickers').save({
          title: emojiToTitle(file.name),
          textToReplace: emojiToCode(file.name),
          path,
          category,
          categoryName,
        })
      )
      .catch((err: unknown) => {
        console.warn('[Stickers] Bulk upload error for', file.name, err);
        this.uploadState!.errors++;
      })
      .finally(() => {
        this.uploadState!.current = index + 1;
        m.redraw();
        this._uploadNext(files, category, categoryName, index + 1);
      });
  }

  /**
   * Envio de um arquivo do lote. O limite é de 30 envios por minuto: no 429
   * espera e tenta de novo, para um lote grande não falhar do 31º em diante.
   */
  _uploadWithRetry(file: File, attempt: number): Promise<string> {
    return uploadStickerFile(file).catch((err: UploadError) => {
      if (err.status !== 429 || attempt >= THROTTLE_MAX_RETRIES) throw err;

      return new Promise((resolve) => setTimeout(resolve, THROTTLE_RETRY_MS)).then(() => this._uploadWithRetry(file, attempt + 1));
    });
  }

  bulkDeleteSelected() {
    const state = app.stickerListState;
    const count = state.selectedCount;
    if (!count) return;

    // `true` devolve string; o array mostraria "Delete ,5, sticker(s)?" no confirm().
    const msg = app.translator.trans('ramon-stickers.admin.sticker_section.delete_selected_confirm', { count }, true);
    if (!confirm(msg)) return;

    this.deletingSelected = true;
    m.redraw();

    const ids = state.selectedArray.slice();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/stickers/bulk-delete',
        body: { ids },
        errorHandler: (error) => {
          throw error;
        },
      })
      .then(() => {
        ids.forEach((id) => {
          const sticker = app.store.getById('stickers', id);
          if (sticker) app.store.remove(sticker);
          state.removeFromList(id);
        });
        state.exitSelectionMode();
      })
      .catch((err) => {
        console.error('[Stickers] Bulk delete failed:', err);
        app.alerts.show(Alert, { type: 'error' }, app.translator.trans('ramon-stickers.admin.sticker_section.delete_selected_error'));
      })
      .then(() => {
        this.deletingSelected = false;
        m.redraw();
      });
  }

  setHoverPlay(value: boolean) {
    this.saveSwitch('ramon-stickers.hover-play', value, 'hoverPlayEnabled', 'savingHoverPlay');
  }

  setShowTooltip(value: boolean) {
    this.saveSwitch('ramon-stickers.show-tooltip', value, 'showTooltipEnabled', 'savingShowTooltip');
  }

  /**
   * O saveSettings() atualiza o app.data.settings, que o oninit lê ao voltar
   * para a página. Se o save falhar, a chave volta.
   */
  saveSwitch(key: string, value: boolean, stateProp: SwitchProp, savingProp: SavingProp) {
    const previous = this[stateProp];
    this[stateProp] = value;
    this[savingProp] = true;
    m.redraw();

    saveSettings({ [key]: value ? '1' : '0' })
      .catch(() => {
        this[stateProp] = previous;
      })
      .finally(() => {
        this[savingProp] = false;
        m.redraw();
      });
  }

  topItems() {
    const items = new ItemList();
    const state = app.stickerListState;
    const selecting = state.selectionMode;

    if (selecting) {
      items.add(
        'deleteSelected',
        <Button
          className="Button Button--danger StickerSection-btn"
          icon="fas fa-trash"
          loading={this.deletingSelected}
          disabled={this.deletingSelected || state.selectedCount === 0}
          onclick={() => this.bulkDeleteSelected()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.delete_selected_button', {
            count: state.selectedCount,
          })}
        </Button>,
        20
      );

      items.add(
        'cancelSelect',
        <Button
          className="Button Button--secondary StickerSection-btn"
          icon="fas fa-times"
          disabled={this.deletingSelected}
          onclick={() => state.exitSelectionMode()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.cancel_select_button')}
        </Button>,
        10
      );
    } else {
      items.add(
        'import',
        <Button
          className="Button Button--secondary StickerSection-btn"
          icon="fas fa-file-import"
          disabled={!!this.importState?.active}
          onclick={() => this.importStickerList()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.import_button')}
        </Button>,
        40
      );

      items.add(
        'export',
        <Button
          className="Button Button--secondary StickerSection-btn"
          icon="fas fa-file-export"
          loading={this.exporting}
          disabled={this.exporting}
          onclick={() => this.exportStickerList()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.export_button')}
        </Button>,
        30
      );

      items.add(
        'bulkUpload',
        <Button
          className="Button Button--primary StickerSection-btn"
          icon="fas fa-images"
          loading={this.uploadState?.active}
          disabled={!!this.uploadState?.active}
          onclick={() => this.bulkUploadFiles()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_button')}
        </Button>,
        20
      );

      items.add(
        'select',
        <Button className="Button Button--secondary StickerSection-btn" icon="fas fa-check-square" onclick={() => state.enterSelectionMode()}>
          {app.translator.trans('ramon-stickers.admin.sticker_section.select_button')}
        </Button>,
        10
      );
    }

    return items;
  }

  importNotice() {
    const s = this.importState;
    if (!s) return null;

    if (s.active) {
      return (
        <div className="StickerSection-notice StickerSection-notice--loading">
          <i className="fas fa-spinner fa-spin" /> {app.translator.trans('ramon-stickers.admin.sticker_section.importing_message')}
        </div>
      );
    }

    if (s.error) {
      return (
        <div className="StickerSection-notice StickerSection-notice--error">
          <i className="fas fa-exclamation-circle" />{' '}
          {app.translator.trans('ramon-stickers.admin.sticker_section.import_error_message', { error: s.error })}
        </div>
      );
    }

    return (
      <div className="StickerSection-notice StickerSection-notice--success">
        <i className="fas fa-check-circle" />{' '}
        {app.translator.trans('ramon-stickers.admin.sticker_section.import_result', {
          imported: s.imported,
          skipped: s.skipped,
        })}
      </div>
    );
  }

  uploadNotice() {
    const u = this.uploadState;
    if (!u) return null;

    if (u.active) {
      return (
        <div className="StickerSection-notice StickerSection-notice--loading">
          <i className="fas fa-spinner fa-spin" />{' '}
          {app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_progress', {
            current: u.current,
            total: u.total,
          })}
        </div>
      );
    }

    return (
      <div className="StickerSection-notice StickerSection-notice--success">
        <i className="fas fa-check-circle" />{' '}
        {app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_done', {
          uploaded: u.total - u.errors,
          errors: u.errors,
        })}
      </div>
    );
  }

  view() {
    return (
      <div className="ExtensionPage-stickerSection">
        <div className="StickerSection-header">
          <div className="container">
            <div className="StickerSection-titleRow">
              <h2>{app.translator.trans('ramon-stickers.admin.sticker_section.heading_title')}</h2>
              <div className="StickerSection-actions">
                <ul>{listItems(this.topItems().toArray())}</ul>
              </div>
            </div>

            {this.importNotice()}
            {this.uploadNotice()}
          </div>
        </div>

        <div className="StickerSection-settingsBar">
          <div className="container">
            <label className="StickerSection-settingRow">
              <Switch state={this.hoverPlayEnabled} loading={this.savingHoverPlay} onchange={(val: boolean) => this.setHoverPlay(val)} />
              <span className="StickerSection-settingLabel">
                <strong>{app.translator.trans('ramon-stickers.admin.settings.hover_play_label')}</strong>
                <span className="helpText">{app.translator.trans('ramon-stickers.admin.settings.hover_play_help')}</span>
              </span>
            </label>
            <label className="StickerSection-settingRow">
              <Switch state={this.showTooltipEnabled} loading={this.savingShowTooltip} onchange={(val: boolean) => this.setShowTooltip(val)} />
              <span className="StickerSection-settingLabel">
                <strong>{app.translator.trans('ramon-stickers.admin.settings.show_tooltip_label')}</strong>
                <span className="helpText">{app.translator.trans('ramon-stickers.admin.settings.show_tooltip_help')}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="container">
          <StickerList />
        </div>
      </div>
    );
  }
}
