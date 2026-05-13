<?php

use Illuminate\Database\Schema\Builder;

// Legacy `my_emoji` table from the original Nodeloc emoji manager. The code that
// read/wrote this table has been removed; drop the table on existing installs.
return [
    'up' => function (Builder $schema) {
        $schema->dropIfExists('my_emoji');
    },
    'down' => function (Builder $schema) {
        // No rollback — the legacy code that consumed this table is gone.
    },
];
