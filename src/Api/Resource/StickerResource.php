<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Ramon\Stickers\Models\Sticker;

/**
 * Todos os campos são públicos de propósito: o picker aparece até para
 * visitantes e um sticker não tem dado pessoal. Campo só de admin, se surgir,
 * precisa de `->visible()`.
 *
 * @extends AbstractDatabaseResource<Sticker>
 */
class StickerResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'stickers';
    }

    public function model(): string
    {
        return Sticker::class;
    }

    public function endpoints(): array
    {
        return [
            // Leitura pública: o picker também aparece para visitantes.
            // Ordem fixa por id: sem ela a paginação por offset podia repetir ou
            // pular stickers (no PostgreSQL a ordem sem ORDER BY não é estável).
            // O picker pede páginas de 200; o teto padrão é 50.
            Endpoint\Index::make()
                ->defaultSort('id')
                ->paginate(20, 200),

            Endpoint\Show::make(),

            Endpoint\Create::make()
                ->authenticated()
                ->can('administrate'),

            Endpoint\Update::make()
                ->authenticated()
                ->can('administrate'),

            Endpoint\Delete::make()
                ->authenticated()
                ->can('administrate'),
        ];
    }

    public function fields(): array
    {
        // requiredOnCreate(), como no core: um PATCH parcial (só o `path`, por
        // exemplo) não precisa reenviar os outros campos.
        //
        // A validação do schema é a proteção contra mass assignment e a primeira
        // barreira contra path traversal: o regex do `path` impede gravar algo
        // como `/../../etc/passwd`, que a exportação leria.
        return [
            Schema\Str::make('title')
                ->nullable()
                ->maxLength(100)
                ->writable(),

            Schema\Str::make('textToReplace')
                ->property('text_to_replace')
                ->requiredOnCreate()
                ->maxLength(100)
                ->regex('/^:[\w\-]+:$/i')
                ->unique('stickers', 'text_to_replace', true)
                ->writable(),

            Schema\Str::make('path')
                ->requiredOnCreate()
                ->maxLength(500)
                // Arquivo em /assets/stickers/ ou URL http(s), como na importação.
                ->regex('#^(/assets/stickers/[A-Za-z0-9._-]+|https?://[^\s]+)$#')
                ->writable(),

            Schema\Str::make('category')
                ->nullable()
                ->maxLength(100)
                ->regex('/^[a-z0-9_]*$/')
                ->writable(),

            Schema\Str::make('categoryName')
                ->property('category_name')
                ->nullable()
                ->maxLength(100)
                ->writable(),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('id'),
        ];
    }
}
