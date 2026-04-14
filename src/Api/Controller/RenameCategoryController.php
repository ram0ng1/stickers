<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

class RenameCategoryController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (!$actor->isAdmin()) {
            return new JsonResponse(['error' => 'Unauthorized'], 403);
        }

        $body        = $request->getParsedBody() ?? [];
        $oldCategory = trim($body['oldCategory'] ?? '');
        $newCategory = trim($body['newCategory'] ?? '');
        $newName     = trim($body['newCategoryName'] ?? '');

        if ($oldCategory === '' || $newCategory === '') {
            return new JsonResponse(['error' => 'Missing category values'], 422);
        }

        $updated = Sticker::where('category', $oldCategory)->update([
            'category'      => $newCategory,
            'category_name' => $newName !== '' ? $newName : $newCategory,
        ]);

        return new JsonResponse(['updated' => $updated]);
    }
}
