import app from 'flarum/admin/app';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import Modal from 'flarum/common/components/Modal';
import ItemList from 'flarum/common/utils/ItemList';
import Stream from 'flarum/common/utils/Stream';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { emojiToSlug, emojiToTitle } from '../../common/utils/emojiFilename';

/**
 * Modal for adding or editing a sticker.
 * Supports images (PNG, GIF, WebP, JPEG), Lottie JSON and TGS files.
 */
export default class EditStickerModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);

    this.sticker      = this.attrs.model || app.store.createRecord('stickers');
    this.category     = Stream(this.sticker.category() || '');
    this.categoryName = Stream(this.sticker.categoryName() || '');
    this.stickerTitle = Stream(this.sticker.title() || '');
    this.textToReplace = Stream(this.sticker.textToReplace() || '');
    this.path         = Stream(this.sticker.path() || '');
    this.uploading    = false;
    this.uploadError  = null;
    // URL that was last rendered into the preview div (to avoid re-rendering same file)
    this._previewUrl  = null;
  }

  className() {
    return 'EditStickerModal Modal--small';
  }

  title() {
    return this.stickerTitle()
      ? this.stickerTitle()
      : app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.modal_title');
  }

  content() {
    return (
      <form className="Modal-body" onsubmit={this.onsubmit.bind(this)}>
        <div className="Form">{this.fields().toArray()}</div>
      </form>
    );
  }

  fields() {
    const items = new ItemList();

    items.add(
      'category',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.sticker_category_label')}</label>
        <input className="FormControl" bidi={this.category} placeholder="my_category" />
        <p className="helpText">Lowercase letters, numbers and underscores only. Special characters are sanitized automatically.</p>
      </div>,
      50
    );

    items.add(
      'categoryName',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.category_name_label')}</label>
        <input className="FormControl" bidi={this.categoryName} placeholder="Memes" />
      </div>,
      40
    );

    items.add(
      'title',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.sticker_title_label')}</label>
        <input className="FormControl" bidi={this.stickerTitle} />
      </div>,
      30
    );

    items.add(
      'textToReplace',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.text_to_replace_label')}</label>
        <input className="FormControl" bidi={this.textToReplace} placeholder=":meme:" />
      </div>,
      20
    );

    items.add(
      'path',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.path_or_url_label')}</label>
        <input
          className="FormControl"
          placeholder="/assets/stickers/meme.png  or  https://..."
          bidi={this.path}
        />
      </div>,
      10
    );

    // File upload (supports Lottie JSON, TGS, PNG, GIF, WebP, JPEG)
    items.add(
      'upload',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_label')}</label>
        <div className="StickerUpload">
          <Button
            className="Button"
            loading={this.uploading}
            disabled={this.uploading}
            onclick={() => this.triggerFileUpload()}
            icon="fas fa-upload"
          >
            {app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_button')}
          </Button>

          {this.path() && (
            <span className="StickerUpload-preview">
              {this.isLottiePath(this.path()) ? (
                // Lottie JSON preview: div container — lottie-web creates canvas inside
                <div
                  className="StickerUpload-animPreview"
                  oncreate={(vnode) => this.initAnimPreview(vnode.dom)}
                  onupdate={(vnode) => this.initAnimPreview(vnode.dom)}
                />
              ) : this.isTgsPath(this.path()) ? (
                // TGS preview: same pattern
                <div
                  className="StickerUpload-animPreview"
                  oncreate={(vnode) => this.initAnimPreview(vnode.dom)}
                  onupdate={(vnode) => this.initAnimPreview(vnode.dom)}
                />
              ) : (
                <img
                  src={urlChecker(this.path()) ? this.path() : app.forum.attribute('baseUrl') + this.path()}
                  alt="preview"
                  className="StickerUpload-img"
                />
              )}
            </span>
          )}

          {this.uploadError && <p className="StickerUpload-error">{this.uploadError}</p>}
        </div>
        <p className="helpText">
          {app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_help')}
        </p>

        {/* TGS license warning — shown whenever a .tgs file is loaded */}
        {this.isTgsPath(this.path()) && (
          <div className="StickerTgsNotice">
            <i className="fas fa-exclamation-triangle StickerTgsNotice-icon" />
            <div className="StickerTgsNotice-body">
              <strong>License notice — TGS file</strong>
              <p>
                TGS files are Telegram animated stickers and may be subject to copyright or
                distribution restrictions imposed by their original authors. By saving this
                sticker you confirm that you have the right to use and distribute this content,
                and you take full legal responsibility for doing so.
              </p>
            </div>
          </div>
        )}
      </div>,
      5
    );

    items.add(
      'submit',
      <div className="Form-group">
        {Button.component(
          {
            type: 'submit',
            className: 'Button Button--primary EditStickerModal-save',
            loading: this.loading,
          },
          app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.submit_button')
        )}
        {this.sticker.exists ? (
          <button type="button" className="Button EditStickerModal-delete" onclick={this.delete.bind(this)}>
            {app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.delete_sticker_button')}
          </button>
        ) : (
          ''
        )}
      </div>,
      -10
    );

    return items;
  }

  isLottiePath(path) {
    return path && path.toLowerCase().endsWith('.json');
  }

  isTgsPath(path) {
    return path && path.toLowerCase().endsWith('.tgs');
  }

  /**
   * Initialize (or re-initialize) the animated preview inside the modal.
   * The preview autoplays — the user wants to see the full animation here.
   */
  initAnimPreview(container) {
    const path = this.path();
    if (!path) return;

    const url = urlChecker(path) ? path : app.forum.attribute('baseUrl') + path;

    // Skip if already rendered for this URL
    if (container.getAttribute('data-preview-url') === url) return;
    container.setAttribute('data-preview-url', url);

    if (this.isLottiePath(path)) {
      renderLottie(container, url, { autoplay: true, loop: true });
    } else if (this.isTgsPath(path)) {
      renderTgs(container, url, { autoplay: true, loop: true });
    }
  }

  triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.tgs,.png,.gif,.webp,.jpg,.jpeg,.apng';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this.uploading = true;
      this.uploadError = null;
      this._previewUrl = null; // force re-render on next update
      m.redraw();

      const formData = new FormData();
      formData.append('file', file);

      fetch(app.forum.attribute('apiUrl') + '/stickers/upload', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': app.session.csrfToken,
        },
        body: formData,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.path) {
            this.path(data.path);

            // Auto-fill title from filename (emoji converted to English names)
            if (!this.stickerTitle()) {
              this.stickerTitle(emojiToTitle(file.name));
            }

            // Auto-fill textToReplace (emoji converted to slug-safe English names)
            if (!this.textToReplace()) {
              this.textToReplace(':' + emojiToSlug(file.name.replace(/\.[^.]+$/, '')) + ':');
            }
          } else {
            this.uploadError = data.error || 'Upload failed';
          }
          this.uploading = false;
          m.redraw();
        })
        .catch((err) => {
          this.uploadError = 'Upload failed: ' + err.message;
          this.uploading = false;
          m.redraw();
        });
    };

    input.click();
  }

  /**
   * Sanitize a raw string into a safe category code:
   * lowercase, strip diacritics, replace any non-alphanumeric chars with _.
   */
  sanitizeCategoryCode(raw) {
    return (raw || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  submitData() {
    return {
      category: this.sanitizeCategoryCode(this.category()),
      categoryName: this.categoryName(),
      title: this.stickerTitle(),
      textToReplace: this.textToReplace(),
      path: this.path(),
    };
  }

  onsubmit(e) {
    e.preventDefault();
    this.loading = true;
    m.redraw();

    const exists = this.sticker.exists;

    this.sticker
      .save(this.submitData())
      .then((sticker) => {
        this.hide();
        if (!exists) app.stickerListState.addToList(sticker);
        this.loading = false;
        this.showSuccessMessage();
        this.clearCache().catch(() => {});
      })
      .catch((err) => {
        this.loading = false;
        m.redraw();
        console.error('[Stickers] Save failed:', err);
      });
  }

  delete() {
    if (confirm(app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.delete_sticker_confirmation'))) {
      this.sticker.delete().then(() => {
        this.hide();
        app.stickerListState.removeFromList(this.sticker.id());
        this.showSuccessMessage();
        this.clearCache().catch(() => {});
      });
    }
  }

  showSuccessMessage() {
    return app.alerts.show(Alert, { type: 'success' }, app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.saved_message'));
  }

  clearCache() {
    return app.request({
      method: 'DELETE',
      url: app.forum.attribute('apiUrl') + '/cache',
    });
  }
}
