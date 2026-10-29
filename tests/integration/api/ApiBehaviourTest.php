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

use Ramon\Stickers\Api\UploadThrottler;
use Ramon\Stickers\Models\Sticker;
use Ramon\Stickers\Tests\integration\StickerTestCase;

/**
 * Listagem, settings do fórum, limite de envio e categorias.
 */
class ApiBehaviourTest extends StickerTestCase
{
    public function test_settings_do_forum_tem_os_padroes(): void
    {
        $attributes = $this->body($this->send($this->request('GET', '/api')))['data']['attributes'];

        $this->assertFalse($attributes['ramonStickersHoverPlay']);
        $this->assertTrue($attributes['ramonStickersShowTooltip']);
        $this->assertSame('[]', $attributes['ramonStickersCategoryOrder']);
    }

    public function test_picker_recebe_ate_200_por_pagina_em_ordem_de_id(): void
    {
        $rows = [];
        for ($i = 60; $i >= 1; $i--) {
            $rows[] = ['id' => $i, 'text_to_replace' => ":s$i:", 'path' => "/assets/stickers/s$i.png"];
        }
        $this->database()->table('stickers')->insert($rows);

        $body = $this->body($this->send($this->request('GET', '/api/stickers')->withQueryParams(['page' => ['limit' => 200]])));

        $ids = array_map('intval', array_column($body['data'], 'id'));
        $this->assertCount(60, $ids);
        $this->assertSame(range(1, 60), $ids);
    }

    public function test_limite_de_envio_vale_pelo_nome_da_rota(): void
    {
        $statuses = [];
        for ($i = 0; $i <= UploadThrottler::LIMIT; $i++) {
            $statuses[] = $this->send($this->request('POST', '/api/stickers/upload', ['authenticatedAs' => 1]))->getStatusCode();
        }

        $this->assertSame(400, $statuses[0], 'sem arquivo: 400');
        $this->assertSame(429, end($statuses));
    }

    public function test_renomear_categoria_mantem_a_posicao_na_ordem(): void
    {
        $this->database()->table('stickers')->insert(['text_to_replace' => ':r:', 'path' => '/assets/stickers/r.png', 'category' => 'velha']);
        $this->send($this->request('POST', '/api/stickers/category-order', ['authenticatedAs' => 1, 'json' => ['order' => ['a', 'velha', 'b']]]));

        $response = $this->send($this->request('POST', '/api/stickers/rename-category', [
            'authenticatedAs' => 1,
            'json' => ['oldCategory' => 'velha', 'newCategory' => 'nova', 'newCategoryName' => 'Nova'],
        ]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('nova', Sticker::query()->value('category'));

        $attributes = $this->body($this->send($this->request('GET', '/api')))['data']['attributes'];
        $this->assertSame(['a', 'nova', 'b'], json_decode($attributes['ramonStickersCategoryOrder'], true));
    }

    public function test_patch_parcial_e_aceito(): void
    {
        $id = $this->body($this->createSticker(['textToReplace' => ':p:', 'path' => '/assets/stickers/p.png']))['data']['id'];

        $response = $this->send($this->request('PATCH', "/api/stickers/$id", [
            'authenticatedAs' => 1,
            'json' => ['data' => ['type' => 'stickers', 'id' => $id, 'attributes' => ['title' => 'Novo título']]],
        ]));

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
    }

    public function test_membro_nao_cria_sticker(): void
    {
        $response = $this->send($this->request('POST', '/api/stickers', [
            'authenticatedAs' => 2,
            'json' => ['data' => ['type' => 'stickers', 'attributes' => ['textToReplace' => ':x:', 'path' => '/assets/stickers/x.png']]],
        ]));

        $this->assertEquals(403, $response->getStatusCode());
    }

    public function test_visitante_lista_os_stickers(): void
    {
        $this->database()->table('stickers')->insert(['text_to_replace' => ':v:', 'path' => '/assets/stickers/v.png']);

        $response = $this->send($this->request('GET', '/api/stickers'));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertCount(1, $this->body($response)['data']);
    }
}
