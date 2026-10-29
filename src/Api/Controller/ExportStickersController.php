<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Api\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;
use Ramon\Stickers\StickerFiles;

class ExportStickersController implements RequestHandlerInterface
{
    public function __construct(
        protected StickerFiles $files
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        // O próprio arquivo do tempnam() vira o ZIP: gravar em "<tempnam>.zip"
        // deixava o arquivo vazio original para trás a cada exportação.
        $tmpFile = tempnam(sys_get_temp_dir(), 'stickers_export_');

        $zip = new \ZipArchive();
        if ($tmpFile === false || $zip->open($tmpFile, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            if ($tmpFile !== false) {
                @unlink($tmpFile);
            }

            return new JsonResponse(['error' => 'Could not create ZIP'], 500);
        }

        $metadata = [];

        Sticker::query()->orderBy('id')->chunk(500, function ($stickers) use (&$metadata, $zip) {
            /** @var Sticker $sticker */
            foreach ($stickers as $sticker) {
                $path = $sticker->path ?? '';
                $item = [
                    'category'        => $sticker->category,
                    'category_name'   => $sticker->category_name,
                    'title'           => $sticker->title,
                    'text_to_replace' => $sticker->text_to_replace,
                    'path'            => $path,
                ];

                // Só entra no ZIP o que estiver dentro de /assets/stickers: um
                // `path` com `../` vindo do banco não lê outros arquivos do servidor.
                $filePath = $this->files->resolve($path);
                if ($filePath !== null && is_file($filePath)) {
                    $zipEntry = 'files/'.basename($path);
                    $zip->addFile($filePath, $zipEntry);
                    $item['file'] = $zipEntry;
                }

                $metadata[] = $item;
            }
        });

        $zip->addFromString('stickers.json', (string) json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();

        // Devolve o ZIP como stream, sem carregar na memória. O arquivo é
        // apagado já: o handle aberto mantém os bytes até a resposta terminar,
        // mesmo se o cliente abortar o download.
        $size = @filesize($tmpFile) ?: null;
        $handle = @fopen($tmpFile, 'rb');
        @unlink($tmpFile);

        if ($handle === false) {
            return new JsonResponse(['error' => 'Could not open generated ZIP'], 500);
        }

        $filename = 'stickers-'.date('Y-m-d').'.zip';

        $response = (new Response())
            ->withBody(new Stream($handle))
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader('Content-Disposition', 'attachment; filename="'.$filename.'"')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Cache-Control', 'private, no-store, max-age=0');

        if ($size !== null) {
            $response = $response->withHeader('Content-Length', (string) $size);
        }

        return $response;
    }
}
