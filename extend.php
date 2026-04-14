<?php

namespace Ramon\Stickers;

use Flarum\Extend;
use Ramon\Stickers\Api\Resource\StickerResource;
use Ramon\Stickers\Api\Controller\ExportStickersController;
use Ramon\Stickers\Api\Controller\ImportStickersController;
use Ramon\Stickers\Api\Controller\RenameCategoryController;
use Ramon\Stickers\Api\Controller\SaveCategoryOrderController;
use Ramon\Stickers\Api\Controller\UploadStickerController;

return [
    (new Extend\Frontend('forum'))
        ->css(__DIR__.'/less/forum.less')
        ->js(__DIR__.'/js/dist/forum.js'),

    (new Extend\Frontend('admin'))
        ->css(__DIR__.'/less/admin.less')
        ->js(__DIR__.'/js/dist/admin.js'),

    new Extend\Locales(__DIR__.'/locale'),

    // Serialize settings to the forum frontend
    (new Extend\Settings)
        ->serializeToForum('ramonStickersHoverPlay',       'ramon-stickers.hover-play',       'boolval', false)
        ->serializeToForum('ramonStickersShowTooltip',     'ramon-stickers.show-tooltip',     'boolval', true)
        ->serializeToForum('ramonStickersCategoryOrder',   'ramon-stickers.category-order',   null,      '[]'),

    (new Extend\Formatter)
        ->configure(ConfigureTextFormatter::class),

    new Extend\ApiResource(StickerResource::class),

    (new Extend\Routes('api'))
        ->post('/stickers/import',           'stickers.import',           ImportStickersController::class)
        ->post('/stickers/upload',           'stickers.upload',           UploadStickerController::class)
        ->post('/stickers/export',           'stickers.export',           ExportStickersController::class)
        ->post('/stickers/rename-category',  'stickers.renameCategory',   RenameCategoryController::class)
        ->post('/stickers/category-order',   'stickers.categoryOrder',    SaveCategoryOrderController::class),
];
