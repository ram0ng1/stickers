import app from 'flarum/admin/app';

/**
 * Envia um arquivo para /stickers/upload e devolve o `path` gravado.
 *
 * Erros (400 com `error`, 413/429 sem JSON) viram um Error com a mensagem
 * mais útil que der para tirar; quem chama mostra do jeito dele.
 */
export default function uploadStickerFile(file) {
  const body = new FormData();
  body.append('file', file);

  return app
    .request({
      method: 'POST',
      url: app.forum.attribute('apiUrl') + '/stickers/upload',
      serialize: (raw) => raw,
      body,
      errorHandler: (error) => {
        throw error;
      },
    })
    .then(
      (data) => {
        if (!data || !data.path) throw new Error((data && data.error) || app.translator.trans('ramon-stickers.admin.upload.failed', {}, true));
        return data.path;
      },
      (error) => {
        const response = error && error.response;
        const message = (response && (response.error || response.errors?.[0]?.detail)) || (error && error.status ? 'HTTP ' + error.status : null);

        const wrapped = new Error(message || app.translator.trans('ramon-stickers.admin.upload.failed', {}, true));
        wrapped.status = error && error.status;
        throw wrapped;
      }
    );
}
