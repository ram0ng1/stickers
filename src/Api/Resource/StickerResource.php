<?php

namespace Ramon\Stickers\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Ramon\Stickers\Models\Sticker;

/**
 * @extends AbstractDatabaseResource<Sticker>
 *
 * Note (CLAUDE.md §6, §I-3): every field on the Sticker model is intentionally public.
 * Stickers have NO PII — the StickerPicker is shown to guests too. If you ever add a
 * field with admin-only data (e.g. uploader IP, internal moderator note), gate it with
 * `->visible(fn ($s, $c) => $c->getActor()->isAdmin())`.
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
            // §I-1: public read by design — the picker is shown to guests too.
            // No `->authenticated()` chained here — adding it would break the forum
            // picker for guest visitors.
            Endpoint\Index::make()
                ->paginate(),

            // §I-2: single-sticker fetch — used by some admin flows.
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
        // CLAUDE.md §6 + §7 + §13: schema-level validation is the v2 mass-assignment
        // guard AND the first line of defense against path traversal in stored data
        // (the `path` regex prevents an admin-compromised account from setting
        // `path = /../../etc/passwd` and exfiltrating via the export endpoint).
        return [
            Schema\Str::make('title')
                ->nullable()
                ->maxLength(100)
                ->writable(),

            Schema\Str::make('textToReplace')
                ->property('text_to_replace')
                ->required()
                ->maxLength(100)
                ->regex('/^:[\w\-]+:$/i')                 // :slug: format
                ->unique('stickers', 'text_to_replace', true)
                ->writable(),

            Schema\Str::make('path')
                ->required()
                ->maxLength(500)
                // Either a confined local asset under /assets/stickers/ OR an http(s) URL.
                // Same shape ImportStickersController::isValidStickerPath accepts.
                ->regex('#^(/assets/stickers/[A-Za-z0-9._-]+|https?://[^\s]+)$#')
                ->writable(),

            Schema\Str::make('category')
                ->nullable()
                ->maxLength(100)
                ->regex('/^[a-z0-9_]*$/')                  // matches frontend sanitizeCategoryCode()
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
