<?php

namespace Ramon\Stickers\Models;

use Flarum\Database\AbstractModel;

/**
 * @property int         $id
 * @property string|null $title
 * @property string|null $text_to_replace
 * @property string      $path
 * @property string|null $category_name
 * @property string|null $category
 */
class Sticker extends AbstractModel
{
    protected $table = 'stickers';

    public static function build(string $category, string $categoryName, string $title, string $textToReplace, string $path): static
    {
        $sticker = new static;

        $sticker->category        = $category;
        $sticker->category_name   = $categoryName;
        $sticker->title           = $title;
        $sticker->text_to_replace = $textToReplace;
        $sticker->path            = $path;

        return $sticker;
    }
}
