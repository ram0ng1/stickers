<?php

namespace Ramon\Stickers;

use Flarum\Http\UrlGenerator;
use Ramon\Stickers\Models\Sticker;
use s9e\TextFormatter\Configurator;

class ConfigureTextFormatter
{
    public function __construct(
        protected UrlGenerator $url
    ) {}

    public function __invoke(Configurator $config): void
    {
        $stickers = Sticker::all();

        foreach ($stickers as $sticker) {
            $path  = $sticker->path;
            $title = htmlspecialchars($sticker->title ?? '', ENT_QUOTES);

            if (!preg_match('/^https?:\/\//i', $path)) {
                $path = $this->url->to('forum')->base() . $path;
            }

            $escapedPath = htmlspecialchars($path, ENT_QUOTES);
            $lowerPath   = strtolower($path);
            $isLottie    = str_ends_with($lowerPath, '.json');
            $isTgs       = str_ends_with($lowerPath, '.tgs');

            if ($isTgs) {
                // TGS (Telegram animated sticker) — gzip-compressed Lottie, rendered by lottie-web
                $html = '<span class="Sticker Sticker--tgs" data-tgs="' . $escapedPath . '" title="' . $title . '"></span>';
            } elseif ($isLottie) {
                // Lottie JSON animated sticker — rendered by lottie-web in the frontend
                $html = '<span class="Sticker Sticker--lottie" data-lottie="' . $escapedPath . '" title="' . $title . '"></span>';
            } else {
                $html = '<span class="Sticker"><img class="sticker" src="' . $escapedPath . '" alt="' . $title . '" /></span>';
            }

            $config->Emoticons->add($sticker->text_to_replace, $html);
        }
    }
}
