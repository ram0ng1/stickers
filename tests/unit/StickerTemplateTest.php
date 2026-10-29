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
use Ramon\Stickers\Formatter\StickerTemplate;
use s9e\TextFormatter\Configurator;

final class StickerTemplateTest extends TestCase
{
    /** @return array<string, array{string, ?string}> */
    public static function inputs(): array
    {
        return [
            'chave aberta no título'  => ['/assets/stickers/a.png', 'Oi {'],
            'expressão no título'     => ['/assets/stickers/a.png', '{//text()}'],
            'chaves na URL externa'   => ['https://cdn.test/{x}.png', 'ok'],
            'aspas e tags no título'  => ['/assets/stickers/a.json', '"><script>alert(1)</script>'],
            'título nulo, TGS'        => ['/assets/stickers/a.tgs', null],
        ];
    }

    #[DataProvider('inputs')]
    public function test_template_compila_e_mantem_o_texto_literal(string $path, ?string $title): void
    {
        $configurator = new Configurator();
        $configurator->Emoticons->add(':s:', StickerTemplate::build($path, $title, 'https://forum.test'));

        ['parser' => $parser, 'renderer' => $renderer] = $configurator->finalize();

        $html = $renderer->render($parser->parse('x :s: y'));

        $this->assertStringContainsString('class="Sticker', $html);
        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringContainsString('title="'.htmlspecialchars($title ?? '').'"', $html);
    }

    public function test_caminho_local_ganha_a_url_do_forum(): void
    {
        $html = StickerTemplate::build('/assets/stickers/a.png', 'A', 'https://forum.test');

        $this->assertStringContainsString('src="https://forum.test/assets/stickers/a.png"', $html);
        $this->assertStringContainsString('<span class="Sticker" title="A">', $html);
    }

    public function test_formatos_animados_usam_o_container_do_lottie(): void
    {
        $this->assertStringContainsString('data-lottie="https://forum.test/assets/stickers/a.json"', StickerTemplate::build('/assets/stickers/a.json', null, 'https://forum.test'));
        $this->assertStringContainsString('data-tgs="https://forum.test/assets/stickers/a.TGS"', StickerTemplate::build('/assets/stickers/a.TGS', null, 'https://forum.test'));
    }

    public function test_attribute_dobra_as_chaves(): void
    {
        $this->assertSame('a{{b}}&quot;', StickerTemplate::attribute('a{b}"'));
    }
}
