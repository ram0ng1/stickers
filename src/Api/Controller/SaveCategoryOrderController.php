<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class SaveCategoryOrderController implements RequestHandlerInterface
{
    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (!$actor->isAdmin()) {
            return new JsonResponse(['error' => 'Unauthorized'], 403);
        }

        $body  = $request->getParsedBody() ?? [];
        $order = $body['order'] ?? [];

        if (!is_array($order)) {
            return new JsonResponse(['error' => 'Invalid order'], 422);
        }

        // Sanitize: keep only non-empty strings
        $order = array_values(array_filter(array_map('strval', $order)));

        $this->settings->set('ramon-stickers.category-order', json_encode($order));

        return new JsonResponse(['saved' => true]);
    }
}
