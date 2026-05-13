<p align="center">
  <h1 align="center">Stickers</h1>
</p>

<p align="center">
  <a href="https://github.com/ram0ng1/stickers/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/ram0ng1/stickers/actions/workflows/ci.yml/badge.svg?branch=main">
  </a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square">
  <a href="https://packagist.org/packages/ramon/stickers">
    <img alt="Latest Stable Version" src="https://img.shields.io/packagist/v/ramon/stickers.svg?style=flat-square">
  </a>
  <a href="https://packagist.org/packages/ramon/stickers">
    <img alt="Total Downloads" src="https://img.shields.io/packagist/dt/ramon/stickers.svg?style=flat-square">
  </a>
  <a href="https://github.com/ram0ng1/stickers/releases/latest">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/ram0ng1/stickers?style=flat-square&label=release&color=success">
  </a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a">
    <img alt="Donate" src="https://img.shields.io/badge/donate-stripe-%236772E5?style=flat-square">
  </a>
</p>

<p align="center">
  A sticker manager for <a href="https://flarum.org">Flarum</a> with native support for animated Lottie JSON and Telegram TGS stickers, in addition to PNG, GIF, WebP, APNG and JPEG. Stickers are organized in categories and inserted into posts through a floating composer picker.
</p>

---

## Features

- **Sticker manager** — Upload, edit, organize and delete stickers from the admin panel.
- **Categories** — Group stickers under named categories with a draggable display order.
- **Animated stickers** — Native rendering of Lottie JSON (`.json`) and Telegram TGS (`.tgs`, gzip-compressed Lottie) via [lottie-web](https://github.com/airbnb/lottie-web) canvas renderer.
- **Static images** — PNG, GIF, WebP, APNG and JPEG supported alongside animations.
- **Composer picker** — A floating sticker picker is added to the post editor toolbar; click a sticker to insert it.
- **Text replacement codes** — Each sticker has a token (e.g. `:smile:`) that is rewritten inline when a post is rendered.
- **Bulk upload** — Drop multiple files at once in the admin panel.
- **Import / Export ZIP** — Export the full sticker library (files + metadata) as a portable archive and re-import it elsewhere. Duplicate codes are skipped automatically.
- **Hover-only animations** — Optional admin setting to keep animations paused on the first frame and play only on hover.
- **Tooltips** — Optional sticker-name tooltip on hover in posts.

## Requirements

- Flarum `^1.8.10 || ^2.0`

## Installation

```sh
composer require ramon/stickers
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

Then enable **Stickers** under the *Extensions* page in the admin panel.

## Updating

```sh
composer update ramon/stickers --with-dependencies
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

## Configuration

All settings are available in the admin panel under the Stickers extension:

| Setting | Description | Default |
|---|---|---|
| Hover-play | Pause animations on first frame; play only while hovering the sticker | `false` |
| Show tooltip | Show sticker-name tooltip on hover in posts | `true` |
| Category order | Drag-and-drop order of categories in the picker | — |

## Import & Export

Use the **Export ZIP** button in the admin page to export all stickers (files + metadata) as a portable archive. Use **Import** to restore from a ZIP, or to import metadata-only from a JSON file. Stickers whose replacement code already exists are skipped — no duplicates.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/stickers/upload` | Upload a sticker file (admin only) |
| `POST` | `/api/stickers/import` | Import a sticker ZIP or JSON metadata (admin only) |
| `POST` | `/api/stickers/export` | Export the sticker library as a ZIP (admin only) |
| `POST` | `/api/stickers/rename-category` | Rename a category across all its stickers (admin only) |
| `POST` | `/api/stickers/category-order` | Persist the category display order (admin only) |
| `GET` | `/api/stickers` | List stickers (public — needed to render in posts) |

## TGS Files — License & Copyright Notice

This extension supports **TGS files** (Telegram animated stickers) as a *technical format*. Support for the format does not grant any rights over the content inside it. Telegram sticker packs are creative works owned by their respective authors. Before uploading a TGS file to your forum, ensure that you are the original author, have explicit permission to redistribute it, or that the sticker is released under a license that permits redistribution. The forum administrator is solely responsible for ensuring that all uploaded content complies with applicable copyright laws and the terms of service of the original platform.

## Links

- [GitHub](https://github.com/ram0ng1/stickers)
- [Issues](https://github.com/ram0ng1/stickers/issues)
- [Donate](https://donate.stripe.com/fZe5o66nebkf39S28a)

## Authors

- [Ramon Guilherme](https://ramonguilherme.com.br)

## License

[MIT](LICENSE)
