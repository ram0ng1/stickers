<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers;

use Flarum\Extend;
use Ramon\Stickers\Api\Controller;
use Ramon\Stickers\Api\Resource\StickerResource;
use Ramon\Stickers\Api\UploadThrottler;

return [
    (new Extend\Frontend('forum'))
        ->css(__DIR__.'/less/forum.less')
        ->js(__DIR__.'/js/dist/forum.js')
        ->jsDirectory(__DIR__.'/js/dist/forum'),

    (new Extend\Frontend('common'))
        ->jsDirectory(__DIR__.'/js/dist/common'),

    (new Extend\Frontend('admin'))
        ->css(__DIR__.'/less/admin.less')
        ->js(__DIR__.'/js/dist/admin.js')
        ->jsDirectory(__DIR__.'/js/dist/admin'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Settings())
        ->default('ramon-stickers.hover-play', false)
        ->default('ramon-stickers.show-tooltip', true)
        ->default('ramon-stickers.category-order', '[]')
        ->serializeToForum('ramonStickersHoverPlay', 'ramon-stickers.hover-play', 'boolval')
        ->serializeToForum('ramonStickersShowTooltip', 'ramon-stickers.show-tooltip', 'boolval')
        ->serializeToForum('ramonStickersCategoryOrder', 'ramon-stickers.category-order'),

    (new Extend\Formatter())
        ->configure(ConfigureTextFormatter::class),

    new Extend\ApiResource(StickerResource::class),

    (new Extend\Routes('api'))
        ->post('/stickers/import', 'stickers.import', Controller\ImportStickersController::class)
        ->post('/stickers/upload', 'stickers.upload', Controller\UploadStickerController::class)
        ->post('/stickers/export', 'stickers.export', Controller\ExportStickersController::class)
        ->post('/stickers/rename-category', 'stickers.renameCategory', Controller\RenameCategoryController::class)
        ->post('/stickers/category-order', 'stickers.categoryOrder', Controller\SaveCategoryOrderController::class)
        ->post('/stickers/bulk-delete', 'stickers.bulkDelete', Controller\BulkDeleteStickersController::class),

    (new Extend\ServiceProvider())
        ->register(StickersServiceProvider::class),

    (new Extend\ThrottleApi())
        ->set('ramonStickersUploadThrottle', UploadThrottler::class),
];
