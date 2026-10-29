export function isLottiePath(path) {
  return !!path && path.toLowerCase().endsWith('.json');
}

export function isTgsPath(path) {
  return !!path && path.toLowerCase().endsWith('.tgs');
}

export function isAnimatedPath(path) {
  return isLottiePath(path) || isTgsPath(path);
}

/**
 * Converte um texto em código de categoria: minúsculas, sem acentos, o resto
 * vira `_`. Bate com o `^[a-z0-9_]*$` que o servidor valida.
 */
export function sanitizeCategoryCode(raw) {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
