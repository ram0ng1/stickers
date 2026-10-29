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

use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Formatter\Formatter;
use Ramon\Stickers\Models\Sticker;

class StickersServiceProvider extends AbstractServiceProvider
{
    public function boot(): void
    {
        // Os stickers entram no formatador como emoticons; o cache dele cai a
        // cada mudança, venha ela do admin, da importação ou direto da API.
        // Os serviços só são resolvidos quando um sticker muda, não a cada requisição.
        Sticker::saved(function (Sticker $sticker) {
            $formatter = $this->container->make(Formatter::class);
            $files = $this->container->make(StickerFiles::class);

            $formatter->flush();

            if ($sticker->wasChanged('path')) {
                $files->deleteIfUnused($sticker->getOriginal('path'));
            }
        });

        Sticker::deleted(function (Sticker $sticker) {
            $this->container->make(Formatter::class)->flush();
            $this->container->make(StickerFiles::class)->deleteIfUnused($sticker->path);
        });
    }
}
