<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Tests\integration;

use Flarum\Discussion\Discussion;
use Flarum\Foundation\Paths;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use Psr\Http\Message\ResponseInterface;

abstract class StickerTestCase extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-stickers');

        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            Discussion::class => [
                ['id' => 1, 'title' => 'Stickers', 'created_at' => '2026-01-01 00:00:00', 'user_id' => 1, 'first_post_id' => null, 'comment_count' => 0],
            ],
        ]);
    }

    protected function tearDown(): void
    {
        // A pasta pública do flarum/testing é a mesma entre os testes.
        foreach (glob($this->stickersDir().'/*') ?: [] as $file) {
            @unlink($file);
        }

        parent::tearDown();
    }

    /** @return array<string, mixed> */
    protected function body(ResponseInterface $response): array
    {
        return (array) json_decode((string) $response->getBody(), true);
    }

    protected function stickersDir(): string
    {
        return $this->app()->getContainer()->make(Paths::class)->public.'/assets/stickers';
    }

    /** Grava um arquivo em /assets/stickers e devolve o `path` dele. */
    protected function putStickerFile(string $name, string $content = "\x89PNG\r\n\x1a\n"): string
    {
        @mkdir($this->stickersDir(), 0777, true);
        file_put_contents($this->stickersDir().'/'.$name, $content);

        return '/assets/stickers/'.$name;
    }

    /** @param array<string, mixed> $attributes */
    protected function createSticker(array $attributes): ResponseInterface
    {
        return $this->send($this->request('POST', '/api/stickers', [
            'authenticatedAs' => 1,
            'json' => ['data' => ['type' => 'stickers', 'attributes' => $attributes]],
        ]));
    }

    protected function reply(string $content): ResponseInterface
    {
        return $this->send($this->request('POST', '/api/posts', [
            'authenticatedAs' => 1,
            'json' => [
                'data' => [
                    'type' => 'posts',
                    'attributes' => ['content' => $content],
                    'relationships' => ['discussion' => ['data' => ['type' => 'discussions', 'id' => '1']]],
                ],
            ],
        ]));
    }
}
