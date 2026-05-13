<?php

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
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // CLAUDE.md §R-5: throw, don't return — let the framework format the 403.
        RequestUtil::getActor($request)->assertAdmin();

        $body  = $request->getParsedBody() ?? [];
        $order = $body['order'] ?? [];

        if (! is_array($order)) {
            throw new ValidationException(['order' => 'Order must be an array']);
        }

        // CLAUDE.md §R-4: bound entry count and length.
        $order = array_slice($order, 0, self::MAX_ENTRIES);

        // Sanitize: cast to string, bound length, validate charset, drop empties.
        $order = array_values(array_filter(array_map(
            fn ($v) => mb_substr(trim((string) $v), 0, self::MAX_CATEGORY_LEN),
            $order
        ), fn ($v) => $v !== '' && preg_match('/^[a-z0-9_]+$/', $v)));

        $this->settings->set('ramon-stickers.category-order', json_encode($order));

        return new JsonResponse(['saved' => true]);
    }
}
