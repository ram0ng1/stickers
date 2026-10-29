import app from 'flarum/admin/app';
import Alert from 'flarum/common/components/Alert';
import Button from 'flarum/common/components/Button';
import Modal, { IInternalModalAttrs } from 'flarum/common/components/Modal';
import ItemList from 'flarum/common/utils/ItemList';
import Stream from 'flarum/common/utils/Stream';
import urlChecker from '../../common/utils/urlChecker';
import { renderLottie } from '../../common/utils/renderLottie';
import { renderTgs } from '../../common/utils/renderTgs';
import { emojiToCode, emojiToTitle } from '../../common/utils/emojiFilename';
import { isLottiePath, isTgsPath, isAnimatedPath, sanitizeCategoryCode } from '../../common/utils/stickerPath';
import uploadStickerFile from '../utils/uploadStickerFile';
import type Sticker from '../../common/models/Sticker';

import type Mithril from 'mithril';

export interface EditStickerModalAttrs extends IInternalModalAttrs {
  model?: Sticker;
}

interface RequestErrorLike {
  message?: string;
  response?: { errors?: { title?: string; detail?: string }[] };
}

/**
 * Modal de criar/editar sticker: imagens (PNG, GIF, WebP, JPEG), Lottie JSON e TGS.
 */
export default class EditStickerModal extends Modal<EditStickerModalAttrs> {
  sticker!: Sticker;
  category!: Stream<string>;
  categoryName!: Stream<string>;
  stickerTitle!: Stream<string>;
  textToReplace!: Stream<string>;
  path!: Stream<string>;
  uploading = false;
  uploadError: string | null = null;
  deleting = false;

  oninit(vnode: Mithril.Vnode<EditStickerModalAttrs, this>) {
    super.oninit(vnode);

    this.sticker = this.attrs.model || app.store.createRecord<Sticker>('stickers');
    this.category = Stream(this.sticker.category() || '');
    this.categoryName = Stream(this.sticker.categoryName() || '');
    this.stickerTitle = Stream(this.sticker.title() || '');
    this.textToReplace = Stream(this.sticker.textToReplace() || '');
    this.path = Stream(this.sticker.path() || '');
  }

  className() {
    return 'EditStickerModal Modal--small';
  }

  title() {
    return this.stickerTitle() ? this.stickerTitle() : app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.modal_title');
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
        <p className="helpText">{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.category_help')}</p>
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
        <input className="FormControl" placeholder="/assets/stickers/meme.png  or  https://..." bidi={this.path} />
      </div>,
      10
    );

    items.add(
      'upload',
      <div className="Form-group">
        <label>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_label')}</label>
        <div className="StickerUpload">
          <Button className="Button" loading={this.uploading} disabled={this.uploading} onclick={() => this.triggerFileUpload()} icon="fas fa-upload">
            {app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_button')}
          </Button>

          {this.path() && (
            <span className="StickerUpload-preview">
              {isLottiePath(this.path()) ? (
                <div
                  className="StickerUpload-animPreview"
                  oncreate={(vnode) => this.initAnimPreview(vnode.dom as HTMLElement)}
                  onupdate={(vnode) => this.initAnimPreview(vnode.dom as HTMLElement)}
                />
              ) : isTgsPath(this.path()) ? (
                <div
                  className="StickerUpload-animPreview"
                  oncreate={(vnode) => this.initAnimPreview(vnode.dom as HTMLElement)}
                  onupdate={(vnode) => this.initAnimPreview(vnode.dom as HTMLElement)}
                />
              ) : (
                <img
                  src={urlChecker(this.path()) ? this.path() : app.forum.attribute('baseUrl') + this.path()}
                  alt={app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.preview_alt', {}, true)}
                  className="StickerUpload-img"
                />
              )}
            </span>
          )}

          {this.uploadError && <p className="StickerUpload-error">{this.uploadError}</p>}
        </div>
        <p className="helpText">{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.upload_help')}</p>

        {isTgsPath(this.path()) && (
          <div className="StickerTgsNotice">
            <i className="fas fa-exclamation-triangle StickerTgsNotice-icon" />
            <div className="StickerTgsNotice-body">
              <strong>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.tgs_notice_title')}</strong>
              <p>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.tgs_notice_body')}</p>
            </div>
          </div>
        )}

        {/* Animação em URL externa não toca (o renderer só aceita a mesma origem). */}
        {urlChecker(this.path()) && isAnimatedPath(this.path()) && (
          <div className="StickerTgsNotice">
            <i className="fas fa-exclamation-triangle StickerTgsNotice-icon" />
            <div className="StickerTgsNotice-body">
              <strong>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.external_anim_notice_title')}</strong>
              <p>{app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.external_anim_notice_body')}</p>
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
          <Button
            type="button"
            className="Button EditStickerModal-delete"
            loading={this.deleting}
            disabled={this.deleting || this.loading}
            onclick={this.delete.bind(this)}
          >
            {app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.delete_sticker_button')}
          </Button>
        ) : (
          ''
        )}
      </div>,
      -10
    );

    return items;
  }

  /**
   * Prévia animada do modal; aqui toca sozinha, para ver a animação inteira.
   */
  initAnimPreview(container: HTMLElement) {
    const path = this.path();
    if (!path) return;

    const url = urlChecker(path) ? path : app.forum.attribute('baseUrl') + path;

    if (container.getAttribute('data-preview-url') === url) return;
    container.setAttribute('data-preview-url', url);

    if (isLottiePath(path)) {
      renderLottie(container, url, { autoplay: true, loop: true });
    } else if (isTgsPath(path)) {
      renderTgs(container, url, { autoplay: true, loop: true });
    }
  }

  triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.tgs,.png,.gif,.webp,.jpg,.jpeg,.apng';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      this.uploading = true;
      this.uploadError = null;
      m.redraw();

      uploadStickerFile(file)
        .then((path) => {
          this.path(path);

          // Título e código saem do nome do arquivo (emojis viram o nome em inglês).
          if (!this.stickerTitle()) {
            this.stickerTitle(emojiToTitle(file.name));
          }

          if (!this.textToReplace()) {
            this.textToReplace(emojiToCode(file.name));
          }
        })
        .catch((err: Error) => {
          this.uploadError = app.translator.trans('ramon-stickers.admin.upload.failed_with_error', { error: err.message }, true);
        })
        .finally(() => {
          this.uploading = false;
          m.redraw();
        });
    };

    input.click();
  }

  submitData() {
    return {
      category: sanitizeCategoryCode(this.category()),
      categoryName: this.categoryName(),
      title: this.stickerTitle(),
      textToReplace: this.textToReplace(),
      path: this.path(),
    };
  }

  onsubmit(e: SubmitEvent) {
    e.preventDefault();
    this.loading = true;
    m.redraw();

    const exists = this.sticker.exists;

    this.sticker
      // O erro sai no alerta do próprio modal; o errorHandler evita um segundo alerta.
      .save(this.submitData(), {
        errorHandler: (error: unknown) => {
          throw error;
        },
      })
      .then((sticker: Sticker) => {
        this.hide();
        if (!exists) app.stickerListState.addToList(sticker);
        this.loading = false;
        this.showSuccessMessage();
      })
      .catch((err: RequestErrorLike) => {
        this.loading = false;
        m.redraw();
        console.error('[Stickers] Save failed:', err);
        // O modal fica aberto para corrigir e tentar de novo.
        this.showErrorMessage(this.extractErrorMessage(err));
      });
  }

  delete() {
    if (!confirm(app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.delete_sticker_confirmation', {}, true))) return;

    const id = this.sticker.id() as string;
    this.deleting = true;
    m.redraw();

    this.sticker
      .delete(
        {},
        {
          errorHandler: (error: unknown) => {
            throw error;
          },
        }
      )
      .then(() => {
        this.hide();
        app.stickerListState.removeFromList(id);
        app.alerts.show(Alert, { type: 'success' }, app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.deleted_message'));
      })
      .catch((err: RequestErrorLike) => {
        console.error('[Stickers] Delete failed:', err);
        this.showErrorMessage(this.extractErrorMessage(err));
      })
      .finally(() => {
        this.deleting = false;
        m.redraw();
      });
  }

  showSuccessMessage() {
    return app.alerts.show(Alert, { type: 'success' }, app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.saved_message'));
  }

  showErrorMessage(message: Mithril.Children) {
    return app.alerts.show(Alert, { type: 'error' }, message);
  }

  /**
   * A mensagem mais útil do erro (o Flarum manda JSON:API com `errors[0].detail`).
   */
  extractErrorMessage(err: RequestErrorLike | null): Mithril.Children {
    const fallback = app.translator.trans('ramon-stickers.admin.sticker_section.edit_sticker.save_error') || 'Save failed.';
    if (!err) return fallback;

    const apiErr = err?.response?.errors?.[0];
    if (apiErr) {
      const parts = [apiErr.title, apiErr.detail].filter(Boolean);
      if (parts.length) return parts.join(' — ');
    }

    if (typeof err.message === 'string' && err.message) return err.message;
    return fallback;
  }
}
