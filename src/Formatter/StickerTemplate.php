<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Formatter;

/**
 * Monta o template XSL do Emoticons de um sticker.
 */
class StickerTemplate
{
    public static function build(string $path, ?string $title, string $forumBaseUrl): string
    {
        if (! preg_match('/^https?:\/\//i', $path)) {
            $path = $forumBaseUrl.$path;
        }

        $escapedPath = self::attribute($path);
        $escapedTitle = self::attribute($title ?? '');
        $lowerPath = strtolower($path);

        if (str_ends_with($lowerPath, '.tgs')) {
            // TGS (Telegram): Lottie comprimido, renderizado pelo lottie-web no frontend.
            return '<span class="Sticker Sticker--tgs" data-tgs="'.$escapedPath.'" title="'.$escapedTitle.'"></span>';
        }

        if (str_ends_with($lowerPath, '.json')) {
            return '<span class="Sticker Sticker--lottie" data-lottie="'.$escapedPath.'" title="'.$escapedTitle.'"></span>';
        }

        return '<span class="Sticker" title="'.$escapedTitle.'"><img class="sticker" src="'.$escapedPath.'" alt="'.$escapedTitle.'" /></span>';
    }

    /**
     * Escapa um valor de atributo do template. Além do HTML, `{` e `}` são
     * dobrados: no XSL eles abrem uma expressão XPath (attribute value template),
     * e um título como `{//text()}` copiaria o texto do post para o atributo.
     */
    public static function attribute(string $value): string
    {
        return strtr(htmlspecialchars($value, ENT_QUOTES), ['{' => '{{', '}' => '}}']);
    }
}
