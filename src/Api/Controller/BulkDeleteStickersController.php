<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

/**
 * Deletes many stickers in a single request.
 *
 * The selection UI used to issue one DELETE /api/stickers/{id} per selected
 * sticker — N sequential round trips, which became noticeably slow when an
 * operator cleared a large selection. This collapses the whole operation to a
 * single bounded query.
 */
class BulkDeleteStickersController implements RequestHandlerInterface
{
    /** Hard cap on how many ids one request may delete (CLAUDE.md §R-4). */
    public const MAX_IDS = 1000;

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // CLAUDE.md §3/§R-5: admin-only, throw don't return — mirrors the
        // single-sticker Endpoint\Delete which chains ->can('administrate').
        RequestUtil::getActor($request)->assertAdmin();

        $body = $request->getParsedBody() ?? [];
        $ids  = $body['ids'] ?? [];

        if (! is_array($ids)) {
            throw new ValidationException(['ids' => 'ids must be an array']);
        }

        // Bound the count, then coerce every entry to a positive int and dedupe.
        $ids = array_slice($ids, 0, self::MAX_IDS);
        $ids = array_values(array_unique(array_filter(
            array_map(fn ($v) => (int) $v, $ids),
            fn ($v) => $v > 0
        )));

        if (count($ids) === 0) {
            return new JsonResponse(['deleted' => 0]);
        }

        $deleted = Sticker::whereIn('id', $ids)->delete();

        return new JsonResponse(['deleted' => $deleted]);
    }
}
