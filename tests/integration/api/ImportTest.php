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

use Laminas\Diactoros\UploadedFile;
use Psr\Http\Message\ResponseInterface;
use Ramon\Stickers\Models\Sticker;
use Ramon\Stickers\Tests\integration\StickerTestCase;

/**
 * POST /api/stickers/import (JSON antigo e ZIP).
 */
class ImportTest extends StickerTestCase
{
    private const PNG = "\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\xff\xff?\0\x05\xfe\x02\xfe\xa75\x81\x84\0\0\0\0IEND\xaeB`\x82";

    /** @param list<array<string, mixed>> $data */
    private function importJson(array $data): ResponseInterface
    {
        return $this->send($this->request('POST', '/api/stickers/import', ['authenticatedAs' => 1, 'json' => ['data' => $data]]));
    }

    /** @param array<string, string> $entries nome no ZIP => conteúdo */
    private function importZip(array $entries): ResponseInterface
    {
        $zipPath = tempnam(sys_get_temp_dir(), 'stickers_test_');
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::OVERWRITE);
        foreach ($entries as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();

        $file = new UploadedFile($zipPath, (int) filesize($zipPath), UPLOAD_ERR_OK, 'stickers.zip', 'application/zip');

        return $this->send($this->request('POST', '/api/stickers/import', ['authenticatedAs' => 1])->withUploadedFiles(['file' => $file]));
    }

    public function test_codigo_fora_do_formato_e_pulado(): void
    {
        $body = $this->body($this->importJson([
            ['text_to_replace' => 'a', 'path' => '/assets/stickers/a.png'],
            ['text_to_replace' => ':com espaco:', 'path' => '/assets/stickers/b.png'],
            ['text_to_replace' => ':ok:', 'path' => '/assets/stickers/c.png'],
        ]));

        $this->assertSame(1, $body['imported']);
        $this->assertSame(2, $body['skipped']);
        $this->assertSame([':ok:'], Sticker::query()->pluck('text_to_replace')->all());
    }

    public function test_categoria_e_convertida_para_o_formato_do_codigo(): void
    {
        $this->importJson([['text_to_replace' => ':cat:', 'path' => '/assets/stickers/cat.png', 'category' => 'Gatos Fofos!']]);

        $this->assertSame('gatos_fofos', Sticker::query()->value('category'));
    }

    public function test_reimportar_o_mesmo_zip_nao_deixa_arquivo_orfao(): void
    {
        $entries = [
            'stickers.json' => (string) json_encode([['text_to_replace' => ':z:', 'title' => 'Z', 'file' => 'files/z.png']]),
            'files/z.png'   => self::PNG,
            'files/solto.png' => self::PNG,
        ];

        $first = $this->body($this->importZip($entries));
        $this->assertSame(1, $first['imported']);
        $this->assertCount(1, glob($this->stickersDir().'/*') ?: []);

        $second = $this->body($this->importZip($entries));
        $this->assertSame(0, $second['imported']);
        $this->assertCount(1, glob($this->stickersDir().'/*') ?: [], 'o duplicado e o arquivo sem entrada não ficam no disco');
    }

    public function test_stickers_json_gigante_e_recusado(): void
    {
        $response = $this->importZip(['stickers.json' => '['.str_repeat(' ', 9 * 1024 * 1024).']']);

        $this->assertEquals(400, $response->getStatusCode());
        $this->assertSame('Archive content too large', $this->body($response)['error']);
    }

    public function test_membro_nao_importa(): void
    {
        $response = $this->send($this->request('POST', '/api/stickers/import', ['authenticatedAs' => 2, 'json' => ['data' => []]]));

        $this->assertEquals(403, $response->getStatusCode());
    }
}
