<!-- # Stickers for Flarum

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Flarum](https://img.shields.io/badge/flarum-%5E2.0-purple)](https://flarum.org)

A sticker manager for Flarum 2.x with native support for animated **Lottie JSON**, **TGS** (Telegram animated stickers), PNG, GIF, WebP and JPEG files.

---

## Features

- Upload and manage stickers from the admin panel
- Organize stickers by **categories** with custom display names
- Animated sticker support via **lottie-web** (canvas renderer)
  - Lottie JSON (`.json`)
  - Telegram stickers (`.tgs`) — gzip-compressed Lottie, decompressed client-side
- Insert stickers into posts via a floating **sticker picker** in the composer
- Text replacement codes (e.g. `:sticker_name:`) rendered inline in posts
- Bulk upload multiple files at once
- Bulk delete by selection
- Export stickers as a ZIP (files + metadata)
- Import from ZIP or JSON metadata file — with deduplication
- Admin settings:
  - Play animations on hover only (vs. autoplay)
  - Show/hide sticker name tooltip on hover (in posts)

---

## Installation

```bash
composer require ramon/stickers
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

## Updating

```bash
composer update ramon/stickers
php flarum migrate
php flarum assets:publish
php flarum cache:clear
```

---

## Import & Export

Use the **Export ZIP** button to export all stickers (files + metadata) as a portable archive.  
Use **Import** to restore from a ZIP or to import metadata from a JSON file.

> Importing skips stickers whose replacement code (`:text:`) already exists — no duplicates are created.

---

## ⚠️ TGS Files — License & Copyright Notice

This extension supports **TGS files** (Telegram animated stickers) as a technical format. However, **support for a file format does not grant any rights over the content inside it.**

Telegram sticker packs are creative works owned by their respective authors. Before uploading a TGS file to your forum, you must ensure that:

- You are the **original author** of the sticker, **or**
- You have explicit **permission** from the author to redistribute it, **or**
- The sticker is released under a license that permits redistribution (e.g. Creative Commons)

The extension displays a license reminder inside the admin panel whenever a TGS file is loaded. This reminder is informational only — **the forum administrator is solely responsible** for ensuring that all uploaded content complies with applicable copyright laws and the terms of service of the original platform.

The author of this extension accepts no liability for unauthorized use of third-party sticker content.

---

## Animated Sticker Rendering

Both `.json` (Lottie) and `.tgs` (Telegram) files are rendered using **[lottie-web](https://github.com/airbnb/lottie-web)** — specifically the canvas renderer (`lottie-web/build/player/lottie_canvas`), bundled statically into the extension's JS.

TGS files are decompressed in the browser using the native `DecompressionStream` API before being passed to lottie-web.

---

## License

[MIT](LICENSE) — © Ramon Guilherme -->
