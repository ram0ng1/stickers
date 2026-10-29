<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Tests\integration\api;

use Ramon\Stickers\Tests\integration\StickerTestCase;

/**
 * Stickers viram emoticons do formatador: o que entra no post e quando.
 */
class FormatterTest extends StickerTestCase
{
    public function test_sticker_novo_renderiza_sem_limpar_o_cache(): void
    {
        // Monta e guarda o formatador antes de o sticker existir.
        $this->assertEquals(201, $this->reply('aquece o cache')->getStatusCode());

        $this->assertEquals(201, $this->createSticker(['textToReplace' => ':oi:', 'path' => '/assets/stickers/oi.png', 'title' => 'Oi'])->getStatusCode());

        $post = $this->reply('olá :oi:');

        $this->assertEquals(201, $post->getStatusCode(), (string) $post->getBody());
        $this->assertStringContainsString('/assets/stickers/oi.png', $this->body($post)['data']['attributes']['contentHtml']);
    }

    public function test_sticker_apagado_deixa_de_renderizar(): void
    {
        $id = $this->body($this->createSticker(['textToReplace' => ':tchau:', 'path' => '/assets/stickers/tchau.png']))['data']['id'];
        $this->reply('aquece :tchau:');

        $this->send($this->request('DELETE', "/api/stickers/$id", ['authenticatedAs' => 1]));

        $html = $this->body($this->reply('de novo :tchau:'))['data']['attributes']['contentHtml'];
        $this->assertStringNotContainsString('tchau.png', $html);
    }

    public function test_chaves_no_titulo_nao_viram_xpath(): void
    {
        // No XSL, `{...}` num atributo é avaliado: este título copiaria o texto do post.
        $this->createSticker(['textToReplace' => ':chave:', 'path' => '/assets/stickers/chave.png', 'title' => '{//text()}']);

        $post = $this->reply('segredo :chave:');

        $this->assertEquals(201, $post->getStatusCode(), (string) $post->getBody());
        $html = $this->body($post)['data']['attributes']['contentHtml'];
        $this->assertStringContainsString('alt="{//text()}"', $html);
        $this->assertStringNotContainsString('alt="segredo', $html);
    }

    public function test_sticker_estatico_tem_title_para_a_dica(): void
    {
        $this->createSticker(['textToReplace' => ':img:', 'path' => '/assets/stickers/img.png', 'title' => 'Imagem']);

        $html = $this->body($this->reply(':img:'))['data']['attributes']['contentHtml'];

        $this->assertMatchesRegularExpression('/<span class="Sticker" title="Imagem"><img/', $html);
    }
}
