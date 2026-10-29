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

use Flarum\Foundation\Paths;
use Ramon\Stickers\Models\Sticker;

/**
 * Arquivos dos stickers em public/assets/stickers.
 */
class StickerFiles
{
    /** Formato de `path` dos arquivos que esta extensão grava. */
    public const LOCAL_PATH = '#^/assets/stickers/[A-Za-z0-9._-]+$#';

    public function __construct(
        protected Paths $paths
    ) {
    }

    public function directory(): string
    {
        return $this->paths->public.'/assets/stickers';
    }

    /**
     * Resolve um `path` guardado para o arquivo real, só se ele estiver dentro
     * da pasta de stickers. Barra `../` e afins vindos do banco.
     */
    public function resolve(string $path): ?string
    {
        if (str_contains($path, "\0") || ! preg_match(self::LOCAL_PATH, $path)) {
            return null;
        }

        $base = realpath($this->directory());
        $resolved = realpath($this->paths->public.$path);

        if ($base === false || $resolved === false) {
            return null;
        }

        return str_starts_with($resolved, $base.DIRECTORY_SEPARATOR) ? $resolved : null;
    }

    /**
     * Apaga o arquivo de um sticker removido ou trocado, se nenhum outro
     * sticker usar o mesmo caminho. URLs externas nunca são tocadas.
     */
    public function deleteIfUnused(?string $path): void
    {
        if ($path === null || $path === '') {
            return;
        }

        $file = $this->resolve($path);

        if ($file === null || Sticker::query()->where('path', $path)->exists()) {
            return;
        }

        @unlink($file);
    }
}
