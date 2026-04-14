import app from 'flarum/admin/app';
import { saveAs } from 'file-saver';
import { emojiToSlug, emojiToTitle } from '../../common/utils/emojiFilename';
import Button from 'flarum/common/components/Button';
import Switch from 'flarum/common/components/Switch';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Component from 'flarum/common/Component';
import ItemList from 'flarum/common/utils/ItemList';
import listItems from 'flarum/common/helpers/listItems';
import StickerList from './StickerList';
import EditStickerModal from './EditStickerModal';

export default class StickerSection extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.hoverPlayEnabled   = app.data.settings['ramon-stickers.hover-play']   === '1';
    this.showTooltipEnabled = app.data.settings['ramon-stickers.show-tooltip'] !== '0';
    this.savingHoverPlay    = false;
    this.savingShowTooltip  = false;

    // Export
    this.exporting = false;

    // Import progress/result
    // { active: bool, imported: N, skipped: N, total: N, error: str|null }
    this.importState = null;

    // Bulk upload progress/result
    // { active: bool, current: N, total: N, errors: N }
    this.uploadState = null;

    // Bulk delete
    this.deletingSelected = false;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  exportStickerList() {
    if (this.exporting) return;
    this.exporting = true;
    m.redraw();

    app
      .request({ method: 'POST', url: app.forum.attribute('apiUrl') + '/stickers/export' })
      .then((response) => {
        const binary = atob(response.data);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        saveAs(new Blob([bytes], { type: 'application/zip' }), response.filename || 'stickers.zip');
      })
      .catch((err) => {
        console.error('[Stickers] Export failed:', err);
        alert(app.translator.trans('ramon-stickers.admin.sticker_section.export_error'));
      })
      .then(() => {
        this.exporting = false;
        m.redraw();
      });
  }

  // ---------------------------------------------------------------------------
  // Import — .zip or .json, with dedup + progress display
  // ---------------------------------------------------------------------------

  importStickerList() {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = '.zip,.json';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.zip')) {
        this.importZip(file);
      } else if (file.name.toLowerCase().endsWith('.json')) {
        this.importLegacyJson(file);
      }
    };

    input.click();
  }

  importZip(file) {
    if (!confirm(app.translator.trans('ramon-stickers.admin.sticker_section.import_zip_message'))) return;

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
      const data = JSON.parse(xhr.responseText);
      app.stickerListState.loading = false;

      if (data.error) {
        this.importState = { active: false, imported: 0, skipped: 0, total: 0, error: data.error };
        m.redraw();
        return;
      }

      this.importState = { active: false, imported: data.imported, skipped: data.skipped, total: data.total, error: null };
      m.redraw();

      // Reload sticker list and clear cache after a short delay
      app.request({ method: 'DELETE', url: app.forum.attribute('apiUrl') + '/cache' }).catch(() => {});
      app.stickerListState.stickers = [];
      app.stickerListState.loadResults();

      setTimeout(() => { this.importState = null; m.redraw(); }, 6000);
    };

    xhr.onerror = () => {
      this.importState = { active: false, imported: 0, skipped: 0, total: 0, error: 'Network error' };
      app.stickerListState.loading = false;
      m.redraw();
    };

    xhr.send(formData);
  }

  importLegacyJson(file) {
    if (!confirm(app.translator.trans('ramon-stickers.admin.sticker_section.import_stickers_message'))) return;

    this.importState = { active: true, imported: 0, skipped: 0, total: 0, error: null };
    app.stickerListState.loading = true;
    m.redraw();

    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');

    reader.onload = (readerEvent) => {
      app
        .request({
          method: 'POST',
          url: `${app.forum.attribute('apiUrl')}/stickers/import`,
          body: { data: JSON.parse(readerEvent.target.result) },
        })
        .then((data) => {
          this.importState = { active: false, imported: data.imported, skipped: data.skipped, total: data.total, error: null };
          app.stickerListState.loading = false;
          m.redraw();

          app.request({ method: 'DELETE', url: app.forum.attribute('apiUrl') + '/cache' }).catch(() => {});
          app.stickerListState.stickers = [];
          app.stickerListState.loadResults();

          setTimeout(() => { this.importState = null; m.redraw(); }, 6000);
        })
        .catch((err) => {
          this.importState = { active: false, imported: 0, skipped: 0, total: 0, error: String(err) };
          app.stickerListState.loading = false;
          m.redraw();
        });
    };
  }

  // ---------------------------------------------------------------------------
  // Bulk upload — multiple files at once
  // ---------------------------------------------------------------------------

  bulkUploadFiles() {
    const categoryName = prompt(
      app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_category_prompt'),
      'Stickers'
    );
    if (categoryName === null) return; // cancelled

    const category = (categoryName || 'stickers')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '_')                      // dots, spaces, special chars → _
      .replace(/^_+|_+$/g, '');                          // trim leading/trailing _
    const catLabel = categoryName || 'Stickers';

    const input    = document.createElement('input');
    input.type     = 'file';
    input.multiple = true;
    input.accept   = '.json,.tgs,.png,.gif,.webp,.jpg,.jpeg,.apng';

    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      this.uploadState = { active: true, current: 0, total: files.length, errors: 0 };
      m.redraw();

      this._uploadNext(files, category, catLabel, 0);
    };

    input.click();
  }

  _uploadNext(files, category, categoryName, index) {
    if (index >= files.length) {
      const { errors, total } = this.uploadState;
      this.uploadState = { active: false, current: total, total, errors };
      app.stickerListState.stickers = [];
      app.stickerListState.loadResults();
      app.request({ method: 'DELETE', url: app.forum.attribute('apiUrl') + '/cache' }).catch(() => {});
      m.redraw();
      setTimeout(() => { this.uploadState = null; m.redraw(); }, 5000);
      return;
    }

    const file     = files[index];
    const formData = new FormData();
    formData.append('file', file);

    fetch(app.forum.attribute('apiUrl') + '/stickers/upload', {
      method:  'POST',
      headers: { 'X-CSRF-Token': app.session.csrfToken },
      body:    formData,
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.path) throw new Error(data.error || 'Upload failed');

        const title = emojiToTitle(file.name);
        const slug  = emojiToSlug(file.name.replace(/\.[^.]+$/, ''));

        return app.store.createRecord('stickers').save({
          title,
          textToReplace: ':' + slug + ':',
          path:          data.path,
          category,
          categoryName,
        });
      })
      .catch((err) => {
        console.warn('[Stickers] Bulk upload error for', file.name, err);
        this.uploadState.errors++;
      })
      .finally(() => {
        this.uploadState.current = index + 1;
        m.redraw();
        this._uploadNext(files, category, categoryName, index + 1);
      });
  }

  // ---------------------------------------------------------------------------
  // Bulk delete selected stickers
  // ---------------------------------------------------------------------------

  bulkDeleteSelected() {
    const state = app.stickerListState;
    const count = state.selectedCount;
    if (!count) return;

    const msg = app.translator.trans('ramon-stickers.admin.sticker_section.delete_selected_confirm', { count });
    if (!confirm(msg)) return;

    this.deletingSelected = true;
    m.redraw();

    const ids = state.selectedArray.slice();
    const deleteNext = (i) => {
      if (i >= ids.length) {
        this.deletingSelected = false;
        state.exitSelectionMode();
        app.request({ method: 'DELETE', url: app.forum.attribute('apiUrl') + '/cache' }).catch(() => {});
        m.redraw();
        return;
      }

      const sticker = state.stickers.find((s) => s.id() === ids[i]);
      if (!sticker) { deleteNext(i + 1); return; }

      sticker
        .delete()
        .then(() => state.removeFromList(ids[i]))
        .catch((err) => console.error('[Stickers] Delete failed for', ids[i], err))
        .finally(() => deleteNext(i + 1));
    };

    deleteNext(0);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  setHoverPlay(value) {
    this.hoverPlayEnabled = value;
    this.savingHoverPlay  = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/settings',
        body: { 'ramon-stickers.hover-play': value ? '1' : '0' },
      })
      .finally(() => { this.savingHoverPlay = false; m.redraw(); });
  }

  setShowTooltip(value) {
    this.showTooltipEnabled = value;
    this.savingShowTooltip  = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: app.forum.attribute('apiUrl') + '/settings',
        body: { 'ramon-stickers.show-tooltip': value ? '1' : '0' },
      })
      .finally(() => { this.savingShowTooltip = false; m.redraw(); });
  }

  // ---------------------------------------------------------------------------
  // Header action buttons
  // ---------------------------------------------------------------------------

  topItems() {
    const items    = new ItemList();
    const state    = app.stickerListState;
    const selecting = state.selectionMode;

    if (selecting) {
      // ── Selection mode ──
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
      // ── Normal mode ──
      items.add(
        'import',
        <Button
          className="Button Button--secondary StickerSection-btn"
          icon="fas fa-file-import"
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
        <Button
          className="Button Button--secondary StickerSection-btn"
          icon="fas fa-check-square"
          onclick={() => state.enterSelectionMode()}
        >
          {app.translator.trans('ramon-stickers.admin.sticker_section.select_button')}
        </Button>,
        10
      );
    }

    return items;
  }

  // ---------------------------------------------------------------------------
  // Status notices
  // ---------------------------------------------------------------------------

  importNotice() {
    const s = this.importState;
    if (!s) return null;

    if (s.active) {
      return (
        <div className="StickerSection-notice StickerSection-notice--loading">
          <i className="fas fa-spinner fa-spin" />
          {' '}
          {app.translator.trans('ramon-stickers.admin.sticker_section.importing_message')}
        </div>
      );
    }

    if (s.error) {
      return (
        <div className="StickerSection-notice StickerSection-notice--error">
          <i className="fas fa-exclamation-circle" />
          {' '}
          {app.translator.trans('ramon-stickers.admin.sticker_section.import_error_message', { error: s.error })}
        </div>
      );
    }

    return (
      <div className="StickerSection-notice StickerSection-notice--success">
        <i className="fas fa-check-circle" />
        {' '}
        {app.translator.trans('ramon-stickers.admin.sticker_section.import_result', {
          imported: s.imported,
          skipped:  s.skipped,
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
          <i className="fas fa-spinner fa-spin" />
          {' '}
          {app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_progress', {
            current: u.current,
            total:   u.total,
          })}
        </div>
      );
    }

    return (
      <div className="StickerSection-notice StickerSection-notice--success">
        <i className="fas fa-check-circle" />
        {' '}
        {app.translator.trans('ramon-stickers.admin.sticker_section.bulk_upload_done', {
          uploaded: u.total - u.errors,
          errors:   u.errors,
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------

  view() {
    return (
      <div className="ExtensionPage-stickerSection">

        {/* ── Header ── */}
        <div className="StickerSection-header">
          <div className="container">
            <div className="StickerSection-titleRow">
              <h2>{app.translator.trans('ramon-stickers.admin.sticker_section.heading_title')}</h2>
              <div className="StickerSection-actions">
                <ul>{listItems(this.topItems().toArray())}</ul>
              </div>
            </div>

            {/* Status notices */}
            {this.importNotice()}
            {this.uploadNotice()}
          </div>
        </div>

        {/* ── Settings bar ── */}
        <div className="StickerSection-settingsBar">
          <div className="container">
            <label className="StickerSection-settingRow">
              <Switch
                state={this.hoverPlayEnabled}
                loading={this.savingHoverPlay}
                onchange={(val) => this.setHoverPlay(val)}
              />
              <span className="StickerSection-settingLabel">
                <strong>{app.translator.trans('ramon-stickers.admin.settings.hover_play_label')}</strong>
                <span className="helpText">
                  {app.translator.trans('ramon-stickers.admin.settings.hover_play_help')}
                </span>
              </span>
            </label>
            <label className="StickerSection-settingRow">
              <Switch
                state={this.showTooltipEnabled}
                loading={this.savingShowTooltip}
                onchange={(val) => this.setShowTooltip(val)}
              />
              <span className="StickerSection-settingLabel">
                <strong>{app.translator.trans('ramon-stickers.admin.settings.show_tooltip_label')}</strong>
                <span className="helpText">
                  {app.translator.trans('ramon-stickers.admin.settings.show_tooltip_help')}
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* ── Sticker list ── */}
        <div className="container">
          <StickerList />
        </div>

      </div>
    );
  }
}
