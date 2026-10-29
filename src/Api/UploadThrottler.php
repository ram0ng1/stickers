<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Api;

use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Cache\Repository;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Limite por ator nas rotas de upload e importação.
 *
 * Mesmo só para admin: uma importação grande (por engano ou não) pesa no
 * servidor. Retornos do ThrottleApi: `true` bloqueia (429), `null` deixa os
 * outros throttlers decidirem. Nunca `false`, que libera todos eles.
 */
class UploadThrottler
{
    public const LIMIT = 30;  // requisições por janela
    public const WINDOW = 60; // segundos

    public const ROUTES = ['stickers.upload', 'stickers.import'];

    public function __construct(
        protected Repository $cache
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ?bool
    {
        // Pelo nome da rota: dentro da pilha da API o caminho da URL não traz o
        // prefixo /api, e o Flarum pode estar numa subpasta.
        if (! in_array($request->getAttribute('routeName'), self::ROUTES, true)) {
            return null;
        }

        $actor = RequestUtil::getActor($request);
        $bucket = $actor->isGuest()
            ? 'guest.'.($request->getServerParams()['REMOTE_ADDR'] ?? 'unknown')
            : 'user.'.(int) $actor->id;

        $key = 'ramon-stickers.throttle.'.$bucket;
        $count = (int) $this->cache->get($key, 0);

        if ($count >= self::LIMIT) {
            return true;
        }

        $this->cache->put($key, $count + 1, self::WINDOW);

        return null;
    }
}
