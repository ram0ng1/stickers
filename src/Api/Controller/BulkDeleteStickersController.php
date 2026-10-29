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

use Flarum\Formatter\Formatter;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;
use Ramon\Stickers\StickerFiles;

/**
 * Apaga vários stickers numa requisição só, em vez de um DELETE por sticker.
 */
class BulkDeleteStickersController implements RequestHandlerInterface
{
    /** Teto de ids por requisição. */
    public const MAX_IDS = 1000;

    public function __construct(
        protected Formatter $formatter,
        protected StickerFiles $files
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $body = (array) ($request->getParsedBody() ?? []);
        $ids = $body['ids'] ?? [];

        if (! is_array($ids)) {
            throw new ValidationException(['ids' => 'ids must be an array']);
        }

        $ids = array_slice($ids, 0, self::MAX_IDS);
        $ids = array_values(array_unique(array_filter(
            array_map(fn ($v) => (int) $v, $ids),
            fn ($v) => $v > 0
        )));

        if (count($ids) === 0) {
            return new JsonResponse(['deleted' => 0]);
        }

        // O delete em massa não dispara os eventos do model: os caminhos são
        // lidos antes, e o cache do formatador e os arquivos ficam por conta daqui.
        $paths = Sticker::query()->whereIn('id', $ids)->pluck('path')->unique()->all();

        $deleted = Sticker::query()->whereIn('id', $ids)->delete();

        if ($deleted > 0) {
            $this->formatter->flush();

            foreach ($paths as $path) {
                $this->files->deleteIfUnused($path);
            }
        }

        return new JsonResponse(['deleted' => $deleted]);
    }
}
