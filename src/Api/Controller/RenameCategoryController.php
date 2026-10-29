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
use Ramon\Stickers\Models\Sticker;

class RenameCategoryController implements RequestHandlerInterface
{
    public const MAX_CATEGORY_LEN = 100;

    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $body = (array) ($request->getParsedBody() ?? []);

        $oldCategory = mb_substr(trim((string) ($body['oldCategory'] ?? '')), 0, self::MAX_CATEGORY_LEN);
        $newCategory = mb_substr(trim((string) ($body['newCategory'] ?? '')), 0, self::MAX_CATEGORY_LEN);
        $newName = mb_substr(trim((string) ($body['newCategoryName'] ?? '')), 0, self::MAX_CATEGORY_LEN);

        if ($oldCategory === '' || $newCategory === '') {
            throw new ValidationException(['category' => 'Missing category values']);
        }

        // Mesmo conjunto que o sanitizeCategoryCode() do admin gera.
        if (! preg_match('/^[a-z0-9_]+$/', $newCategory)) {
            throw new ValidationException(['newCategory' => 'Category code must be lowercase letters, numbers and underscores only']);
        }

        $updated = Sticker::query()->where('category', $oldCategory)->update([
            'category'      => $newCategory,
            'category_name' => $newName !== '' ? $newName : $newCategory,
        ]);

        $this->renameInSavedOrder($oldCategory, $newCategory);

        return new JsonResponse(['updated' => $updated]);
    }

    /**
     * A ordem salva guarda os códigos: sem trocar aqui, a categoria renomeada
     * ia para o fim da lista no admin e no picker.
     */
    private function renameInSavedOrder(string $old, string $new): void
    {
        if ($old === $new) {
            return;
        }

        $order = json_decode((string) $this->settings->get('ramon-stickers.category-order', '[]'), true);

        if (! is_array($order) || ! in_array($old, $order, true)) {
            return;
        }

        $order = array_map(fn ($key) => $key === $old ? $new : $key, $order);

        $this->settings->set('ramon-stickers.category-order', json_encode(array_values(array_unique($order))));
    }
}
