<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers;

use Flarum\Http\UrlGenerator;
use Ramon\Stickers\Formatter\StickerTemplate;
use Ramon\Stickers\Models\Sticker;
use s9e\TextFormatter\Configurator;

class ConfigureTextFormatter
{
    public function __construct(
        protected UrlGenerator $url
    ) {
    }

    public function __invoke(Configurator $config): void
    {
        $baseUrl = $this->url->to('forum')->base();

        // chunk(): a memória não cresce com o tamanho da biblioteca.
        Sticker::query()
            ->orderBy('id')
            ->chunk(500, function ($stickers) use ($config, $baseUrl) {
                /** @var Sticker $sticker */
                foreach ($stickers as $sticker) {
                    $config->Emoticons->add(
                        (string) $sticker->text_to_replace,
                        StickerTemplate::build((string) $sticker->path, $sticker->title, $baseUrl)
                    );
                }
            });
    }
}
