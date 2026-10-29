import { replace as replaceEmoji } from 'node-emoji';

/**
 * Troca os emojis do nome do arquivo (sem extensão) pelo nome em inglês,
 * gerando um slug para o título e o código do sticker.
 *
 * Exemplos:
 *   "😀_happy"      → "grinning_happy"
 *   "🎉party_time"  → "tada_party_time"
 *   "sticker_😂"    → "sticker_joy"
 *   "cool😎"        → "cool_sunglasses"
 */
export function emojiToSlug(raw: string): string {
  const replaced = replaceEmoji(raw, (emoji: { key: string }) => '_' + emoji.key + '_');

  return replaced.replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

/**
 * Gera um título legível a partir do nome do arquivo: emojis viram o nome em
 * inglês, `_` e `-` viram espaço, iniciais maiúsculas.
 *
 * Exemplos:
 *   "😀_happy.tgs"  → "Grinning Happy"
 *   "party🎉time"   → "Party Tada Time"
 */
export function emojiToTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');

  const slug = emojiToSlug(base);

  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Código do sticker (`:slug:`) a partir do nome do arquivo. Acentos e
 * caracteres fora de `[a-z0-9_-]` viram `_`, como exige o servidor: um código
 * como `:meu sticker:` seria recusado na criação, depois do arquivo enviado.
 */
export function emojiToCode(filename: string): string {
  const slug = emojiToSlug(filename.replace(/\.[^.]+$/, ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return ':' + (slug || 'sticker') + ':';
}
