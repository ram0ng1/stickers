<?php

namespace Ramon\Stickers\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Ramon\Stickers\Models\Sticker;

/**
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
            Endpoint\Index::make()
                ->paginate(),

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
        return [
            Schema\Str::make('title')
                ->nullable()
                ->writable(),

            Schema\Str::make('textToReplace')
                ->property('text_to_replace')
                ->nullable()
                ->writable(),

            Schema\Str::make('path')
                ->writable(),

            Schema\Str::make('category')
                ->nullable()
                ->writable(),

            Schema\Str::make('categoryName')
                ->property('category_name')
                ->nullable()
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
