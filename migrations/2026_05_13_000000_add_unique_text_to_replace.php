<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// CLAUDE.md §R-3: prevent TOCTOU duplicates on text_to_replace.
// The application-level `where(...)->exists()` check in ImportStickersController
// is racy under concurrent Creates; enforcing uniqueness at the DB level closes
// the race.
//
// Pre-clean any existing duplicates BEFORE adding the unique index (mirrors
// flarum/flags migration pattern — CLAUDE.md §34/I) so this migration doesn't
// crash on dirty production data.

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('stickers')) {
            return;
        }

        $connection = $schema->getConnection();

        // 1) Pre-clean — keep the lowest id per text_to_replace, delete the rest.
        //    Skip NULLs (they're allowed under the current nullable column).
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

        // 2) Add the unique index idempotently. Previously we read
        //    INFORMATION_SCHEMA.STATISTICS to detect the existing index, but that
        //    is MySQL-specific and breaks on any non-MySQL backend Flarum may end
        //    up supporting (PostgreSQL ships INFORMATION_SCHEMA but populates it
        //    differently; SQLite has no INFORMATION_SCHEMA at all).
        //
        //    Instead we just try to add the index and swallow the "already exists"
        //    error — portable across every driver. Any OTHER error still bubbles
        //    up so dirty-state failures stay visible.
        try {
            $schema->table('stickers', function (Blueprint $table) {
                $table->unique('text_to_replace');
            });
        } catch (\Throwable $e) {
            $message = strtolower($e->getMessage());
            // MySQL: "Duplicate key name", SQLite: "index ... already exists",
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
            // If the index isn't there, rollback should still succeed.
        }
    },
];
