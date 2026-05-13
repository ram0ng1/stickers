<?php

namespace Ramon\Stickers\Api;

use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Cache\Repository;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Per-actor rate limit for the sticker upload/import routes.
 *
 * CLAUDE.md §18 / §R-2: even though these routes are admin-only, an admin doing a
 * malicious or accidental large import can degrade the server. This caps the
 * number of upload/import requests per actor per minute.
 *
 * Return semantics (per Flarum's ThrottleApi):
 *   - `false`  → bypass ALL throttlers (NEVER return this — see §17)
 *   - `true`   → throttle (limit hit, request rejected with 429)
 *   - `null`   → abstain (let other throttlers decide)
 *   - integer  → seconds remaining until reset
 */
class UploadThrottler
{
    public const LIMIT  = 30;     // requests per window
    public const WINDOW = 60;     // window length in seconds

    public function __construct(
        protected Repository $cache
    ) {}

    public function __invoke(ServerRequestInterface $request)
    {
        $path = $request->getUri()->getPath();
        if (! preg_match('#^/api/stickers/(upload|import)$#', $path)) {
            return null;   // not our route — abstain
        }

        $actor = RequestUtil::getActor($request);
        // Per-actor bucket: keyed by user id, or by IP for guests (defensive only —
        // these endpoints already require admin so guests should never reach here).
        $bucket = $actor->isGuest()
            ? 'guest.' . ($request->getServerParams()['REMOTE_ADDR'] ?? 'unknown')
            : 'user.' . (int) $actor->id;

        $key   = 'ramon-stickers.throttle.' . $bucket;
        $count = (int) $this->cache->get($key, 0);

        if ($count >= self::LIMIT) {
            return true;   // hit — return 429
        }

        $this->cache->put($key, $count + 1, self::WINDOW);
        return null;       // not throttled here, but let other throttlers run
    }
}
