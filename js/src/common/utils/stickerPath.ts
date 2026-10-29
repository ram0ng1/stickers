export function isLottiePath(path: string | null | undefined): boolean {
  return !!path && path.toLowerCase().endsWith('.json');
}

export function isTgsPath(path: string | null | undefined): boolean {
  return !!path && path.toLowerCase().endsWith('.tgs');
}

export function isAnimatedPath(path: string | null | undefined): boolean {
  return isLottiePath(path) || isTgsPath(path);
}

/**
 * Converte um texto em código de categoria: minúsculas, sem acentos, o resto
 * vira `_`. Bate com o `^[a-z0-9_]*$` que o servidor valida.
 */
export function sanitizeCategoryCode(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
