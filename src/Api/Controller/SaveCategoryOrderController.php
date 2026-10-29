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

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class SaveCategoryOrderController implements RequestHandlerInterface
{
    public const MAX_CATEGORY_LEN = 100;
    public const MAX_ENTRIES      = 500;

    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $body  = (array) ($request->getParsedBody() ?? []);
        $order = $body['order'] ?? [];

        if (! is_array($order)) {
            throw new ValidationException(['order' => 'Order must be an array']);
        }

        $order = array_slice($order, 0, self::MAX_ENTRIES);

        $order = array_values(array_filter(array_map(
            fn ($v) => mb_substr(trim((string) $v), 0, self::MAX_CATEGORY_LEN),
            $order
        ), fn ($v) => $v !== '' && preg_match('/^[a-z0-9_]+$/', $v)));

        $this->settings->set('ramon-stickers.category-order', json_encode($order));

        return new JsonResponse(['saved' => true]);
    }
}
