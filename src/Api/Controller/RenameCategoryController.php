<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

class RenameCategoryController implements RequestHandlerInterface
{
    public const MAX_CATEGORY_LEN = 100;

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // CLAUDE.md §R-5: throw, don't return — let the framework format the 403.
        RequestUtil::getActor($request)->assertAdmin();

        $body = $request->getParsedBody() ?? [];

        // CLAUDE.md §R-4: bound + format-validate every category input.
        $oldCategory = mb_substr(trim((string) ($body['oldCategory'] ?? '')), 0, self::MAX_CATEGORY_LEN);
        $newCategory = mb_substr(trim((string) ($body['newCategory'] ?? '')), 0, self::MAX_CATEGORY_LEN);
        $newName     = mb_substr(trim((string) ($body['newCategoryName'] ?? '')), 0, self::MAX_CATEGORY_LEN);

        if ($oldCategory === '' || $newCategory === '') {
            throw new ValidationException(['category' => 'Missing category values']);
        }

        // Category code must match the same charset the frontend sanitizes to:
        // lowercase ASCII alphanumerics + underscore (see EditStickerModal.sanitizeCategoryCode).
        if (! preg_match('/^[a-z0-9_]+$/', $newCategory)) {
            throw new ValidationException(['newCategory' => 'Category code must be lowercase letters, numbers and underscores only']);
        }

        $updated = Sticker::where('category', $oldCategory)->update([
            'category'      => $newCategory,
            'category_name' => $newName !== '' ? $newName : $newCategory,
        ]);

        return new JsonResponse(['updated' => $updated]);
    }
}
