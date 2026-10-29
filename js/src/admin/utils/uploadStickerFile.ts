import app from 'flarum/admin/app';

export interface UploadError extends Error {
  status?: number;
}

interface UploadResponse {
  path?: string;
  error?: string;
}

/**
 * Envia um arquivo para /stickers/upload e devolve o `path` gravado.
 *
 * Erros (400 com `error`, 413/429 sem JSON) viram um Error com a mensagem
 * mais útil que der para tirar; quem chama mostra do jeito dele.
 */
export default function uploadStickerFile(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);

  const failed = () => app.translator.trans('ramon-stickers.admin.upload.failed', {}, true);

  return app
    .request<UploadResponse>({
      method: 'POST',
      url: app.forum.attribute('apiUrl') + '/stickers/upload',
      serialize: (raw: FormData) => raw,
      body,
      errorHandler: (error: unknown) => {
        throw error;
      },
    })
    .then(
      (data) => {
        if (!data || !data.path) throw new Error((data && data.error) || failed());
        return data.path;
      },
      (error: { status?: number; response?: { error?: string; errors?: { detail?: string }[] } } | null) => {
        const response = error?.response;
        const message = response?.error || response?.errors?.[0]?.detail || (error?.status ? 'HTTP ' + error.status : null);

        const wrapped: UploadError = new Error(message || failed());
        wrapped.status = error?.status;
        throw wrapped;
      }
    );
}
