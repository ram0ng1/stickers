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
 * Arquivos em /assets/stickers quando stickers são apagados ou trocados.
 */
class StickerFilesTest extends StickerTestCase
{
    public function test_apagar_o_sticker_remove_o_arquivo(): void
    {
        $path = $this->putStickerFile('a.png');
        $id = $this->body($this->createSticker(['textToReplace' => ':a:', 'path' => $path]))['data']['id'];

        $response = $this->send($this->request('DELETE', "/api/stickers/$id", ['authenticatedAs' => 1]));

        $this->assertEquals(204, $response->getStatusCode());
        $this->assertFileDoesNotExist($this->stickersDir().'/a.png');
    }

    public function test_arquivo_usado_por_outro_sticker_fica(): void
    {
        $path = $this->putStickerFile('b.png');
        $id = $this->body($this->createSticker(['textToReplace' => ':b1:', 'path' => $path]))['data']['id'];
        $this->createSticker(['textToReplace' => ':b2:', 'path' => $path]);

        $this->send($this->request('DELETE', "/api/stickers/$id", ['authenticatedAs' => 1]));

        $this->assertFileExists($this->stickersDir().'/b.png');
    }

    public function test_trocar_o_arquivo_remove_o_antigo(): void
    {
        $old = $this->putStickerFile('velho.png');
        $new = $this->putStickerFile('novo.png');
        $id = $this->body($this->createSticker(['textToReplace' => ':troca:', 'path' => $old]))['data']['id'];

        $response = $this->send($this->request('PATCH', "/api/stickers/$id", [
            'authenticatedAs' => 1,
            'json' => ['data' => ['type' => 'stickers', 'id' => $id, 'attributes' => ['path' => $new]]],
        ]));

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertFileDoesNotExist($this->stickersDir().'/velho.png');
        $this->assertFileExists($this->stickersDir().'/novo.png');
    }

    public function test_exclusao_em_massa_remove_os_arquivos_e_o_formatador_esquece(): void
    {
        $ids = [];
        foreach (['m1', 'm2'] as $name) {
            $ids[] = $this->body($this->createSticker(['textToReplace' => ":$name:", 'path' => $this->putStickerFile("$name.png")]))['data']['id'];
        }
        $this->reply('aquece :m1:');

        $response = $this->send($this->request('POST', '/api/stickers/bulk-delete', ['authenticatedAs' => 1, 'json' => ['ids' => $ids]]));

        $this->assertEquals(2, $this->body($response)['deleted']);
        $this->assertFileDoesNotExist($this->stickersDir().'/m1.png');
        $this->assertFileDoesNotExist($this->stickersDir().'/m2.png');
        $this->assertStringNotContainsString('m1.png', $this->body($this->reply(':m1:'))['data']['attributes']['contentHtml']);
    }

    public function test_exportar_nao_deixa_arquivo_temporario(): void
    {
        $this->createSticker(['textToReplace' => ':exp:', 'path' => $this->putStickerFile('exp.png')]);
        $before = glob(sys_get_temp_dir().'/stickers_export_*') ?: [];

        $response = $this->send($this->request('POST', '/api/stickers/export', ['authenticatedAs' => 1]));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertSame('application/zip', $response->getHeaderLine('Content-Type'));
        $this->assertSame([], array_values(array_diff(glob(sys_get_temp_dir().'/stickers_export_*') ?: [], $before)));
    }
}
