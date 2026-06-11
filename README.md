<p align="center">
  <img src="icon.svg" width="80" height="80" alt="Stickers">
</p>

<h1 align="center">Stickers</h1>

<p align="center">
  <a href="https://github.com/ram0ng1/stickers/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ram0ng1/stickers/ci.yml?branch=main&style=flat-square&label=ci"></a>
  <a href="https://packagist.org/packages/ramon/stickers"><img alt="Packagist" src="https://img.shields.io/packagist/v/ramon/stickers?style=flat-square&label=packagist"></a>
  <a href="https://packagist.org/packages/ramon/stickers"><img alt="Downloads" src="https://img.shields.io/packagist/dt/ramon/stickers?style=flat-square"></a>
  <img alt="Flarum" src="https://img.shields.io/badge/flarum-2.x-e7672e?style=flat-square">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a"><img alt="Donate" src="https://img.shields.io/badge/donate-stripe-6772E5?style=flat-square"></a>
</p>

<p align="center">Stickers for Flarum posts, animated ones included.</p>

Stickers brings a sticker picker to the post composer. Upload your library in the admin panel, organize it in categories, and your users drop stickers into posts with one click. Each sticker also gets a text code like `:smile:` that is rewritten when the post renders.

The fun part is animation support. Lottie JSON and Telegram TGS files play natively in posts, right alongside plain PNG, GIF, WebP, APNG and JPEG.

## What it does

- Floating sticker picker in the composer toolbar
- Categories with drag and drop ordering
- Native playback of Lottie and TGS animations via lottie-web
- Bulk upload by dropping several files at once
- Export of the whole library as a ZIP, importable on another forum with duplicates skipped
- Optional hover only mode that keeps animations paused until the cursor is on them
- Works on Flarum 1.8 and 2.x

## Installation

```sh
composer require ramon/stickers
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

Then enable Stickers on the Extensions page and start uploading.

## About TGS files

TGS support is a technical format feature, nothing more. Telegram sticker packs belong to their authors, so only upload packs you made, have permission to redistribute, or that carry a license allowing it. That responsibility sits with the forum administrator.

## License

[MIT](LICENSE). Bugs and suggestions go in the [issue tracker](https://github.com/ram0ng1/stickers/issues).
