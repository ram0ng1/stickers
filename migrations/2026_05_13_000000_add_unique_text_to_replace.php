<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Índice UNIQUE em text_to_replace: a checagem da aplicação sozinha tem corrida
// entre duas criações simultâneas.
//
// Os duplicados existentes saem antes do índice, para a migração não quebrar
// com dados antigos.

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('stickers')) {
            return;
        }

        $connection = $schema->getConnection();

        // 1) Mantém o menor id de cada text_to_replace e apaga o resto. NULL fica
        //    (a coluna aceita).
        $duplicates = $connection->table('stickers')
            ->select('text_to_replace')
            ->whereNotNull('text_to_replace')
            ->where('text_to_replace', '<>', '')
            ->groupBy('text_to_replace')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('text_to_replace');

        foreach ($duplicates as $value) {
            $keep = $connection->table('stickers')
                ->where('text_to_replace', $value)
                ->orderBy('id')
                ->value('id');

            if ($keep !== null) {
                $connection->table('stickers')
                    ->where('text_to_replace', $value)
                    ->where('id', '<>', $keep)
                    ->delete();
            }
        }

        // 2) Cria o índice e ignora só o erro de "já existe", o que funciona em
        //    qualquer banco (o SQLite não tem INFORMATION_SCHEMA). Qualquer outro
        //    erro sobe.
        try {
            $schema->table('stickers', function (Blueprint $table) {
                $table->unique('text_to_replace');
            });
        } catch (\Throwable $e) {
            $message = strtolower($e->getMessage());
            // MySQL: "Duplicate key name"; SQLite: "index ... already exists";
            // PostgreSQL: "relation ... already exists".
            $alreadyExists = str_contains($message, 'duplicate key name')
                || str_contains($message, 'already exists');
            if (! $alreadyExists) {
                throw $e;
            }
        }
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasTable('stickers')) {
            return;
        }
        try {
            $schema->table('stickers', function (Blueprint $table) {
                $table->dropUnique(['text_to_replace']);
            });
        } catch (\Throwable $e) {
            // Sem o índice, o rollback segue mesmo assim.
        }
    },
];
