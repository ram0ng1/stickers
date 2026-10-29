<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Stickers\Tests\unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\Stickers\Api\Controller\ImportStickersController;

/**
 * Mesma conversão do sanitizeCategoryCode() do admin (js/src/common/utils/stickerPath.js).
 */
final class ImportCategoryTest extends TestCase
{
    /** @return array<string, array{string, string}> */
    public static function categories(): array
    {
        return [
            'já no formato'    => ['memes_2026', 'memes_2026'],
            'acentos e espaço' => ['Reações Fofas', 'reacoes_fofas'],
            'pontuação'        => ['--Gatos!!--', 'gatos'],
            'vazio'            => ['', ''],
        ];
    }

    #[DataProvider('categories')]
    public function test_sanitiza(string $raw, string $expected): void
    {
        $this->assertSame($expected, ImportStickersController::sanitizeCategory($raw));
    }
}
