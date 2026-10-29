<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

use Illuminate\Database\Schema\Builder;

// Tabela `my_emoji` do gerenciador de emojis original (Nodeloc), de onde esta
// extensão veio. O código que a usava saiu; a tabela é removida.
return [
    'up' => function (Builder $schema) {
        $schema->dropIfExists('my_emoji');
    },
    'down' => function (Builder $schema) {
        // Sem volta: o código que usava a tabela não existe mais.
    },
];
