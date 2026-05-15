<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

class ImportStickersController implements RequestHandlerInterface
{
    public const MAX_ZIP_BYTES        = 64 * 1024 * 1024;  // 64 MB compressed
    public const MAX_ENTRY_BYTES      = 8 * 1024 * 1024;   // 8 MB per extracted file
    public const MAX_TOTAL_EXTRACTED  = 256 * 1024 * 1024; // 256 MB total uncompressed (zip-bomb guard)
    public const ALLOWED_EXTENSIONS   = ['json', 'tgs', 'png', 'apng', 'gif', 'webp', 'jpg', 'jpeg'];

    public function __construct(
        protected Paths $paths
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $uploadedFiles = $request->getUploadedFiles();

        // ZIP import — contains stickers.json + actual files.
        if (! empty($uploadedFiles['file'])) {
            return $this->handleZipImport($uploadedFiles['file']);
        }

        // Legacy JSON-only import — metadata, no files.
        $data = Arr::get($request->getParsedBody(), 'data', []);

        return $this->importData(is_array($data) ? $data : []);
    }

    // -------------------------------------------------------------------------

    private function handleZipImport($uploadedFile): ResponseInterface
    {
        if ($uploadedFile->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['error' => 'Upload error: ' . $uploadedFile->getError()], 400);
        }

        $size = $uploadedFile->getSize();
        if ($size === null || $size <= 0 || $size > self::MAX_ZIP_BYTES) {
            return new JsonResponse(['error' => 'ZIP size invalid or exceeds limit'], 400);
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'stickers_import_');
        $uploadedFile->moveTo($tmpFile);

        $zip = new \ZipArchive();
        if ($zip->open($tmpFile) !== true) {
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'Invalid ZIP file'], 400);
        }

        $metadataJson = $zip->getFromName('stickers.json');
        if ($metadataJson === false) {
            $zip->close();
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'stickers.json not found inside the ZIP'], 400);
        }

        $metadata = json_decode($metadataJson, true);
        if (! is_array($metadata)) {
            $zip->close();
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'stickers.json contains invalid JSON'], 400);
        }

        $dir = $this->paths->public . '/assets/stickers/';
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Map old basename (in the ZIP) → new random server-side filename.
        $renameMap   = [];
        $totalBytes  = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            if (! str_starts_with($entryName, 'files/') || $entryName === 'files/') {
                continue;
            }

            $stat = $zip->statIndex($i);
            $declaredSize = (int) ($stat['size'] ?? 0);
            if ($declaredSize > self::MAX_ENTRY_BYTES) {
                continue; // skip oversized entry — do NOT abort whole import, just drop it
            }

            $totalBytes += $declaredSize;
            if ($totalBytes > self::MAX_TOTAL_EXTRACTED) {
                $zip->close();
                @unlink($tmpFile);
                return new JsonResponse(['error' => 'Archive content too large'], 400);
            }

            $originalBasename = basename($entryName);
            $extension = strtolower(pathinfo($originalBasename, PATHINFO_EXTENSION));
            if (! in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
                continue;
            }

            $content = $zip->getFromIndex($i, self::MAX_ENTRY_BYTES + 1);
            if ($content === false || strlen($content) > self::MAX_ENTRY_BYTES) {
                continue;
            }

            // MIME sniff via finfo_buffer (no temp file needed)
            if (! $this->mimeMatches($content, $extension)) {
                continue;
            }

            // Server-controlled random filename — ignore client name.
            $newFilename = bin2hex(random_bytes(16)) . '.' . $extension;
            $dest        = $dir . $newFilename;

            if (file_put_contents($dest, $content) !== false) {
                @chmod($dest, 0644);
                $renameMap[$originalBasename] = $newFilename;
            }
        }

        $zip->close();
        @unlink($tmpFile);

        // Rewrite metadata paths to the new random filenames; drop entries whose
        // file failed validation above (so we don't end up with broken stickers).
        $validated = [];
        foreach ($metadata as $item) {
            if (! is_array($item)) {
                continue;
            }
            if (! empty($item['file'])) {
                $oldBase = basename((string) $item['file']);
                if (! isset($renameMap[$oldBase])) {
                    continue; // file missing or rejected
                }
                $item['path'] = '/assets/stickers/' . $renameMap[$oldBase];
                unset($item['file']);
            }
            $validated[] = $item;
        }

        return $this->importData($validated);
    }

    private function importData(array $data): ResponseInterface
    {
        $imported = 0;
        $skipped  = 0;

        // First pass: pre-validate every row in memory and collect the candidate
        // text_to_replace values. We then issue ONE `WHERE IN (...)` query (chunked
        // to respect MySQL placeholder limits) to find existing rows — instead of
        // running an EXISTS round trip per row (CLAUDE.md §R-6: N+1 elimination).
        $candidates = [];
        foreach ($data as $i => $item) {
            if (! is_array($item)) {
                $skipped++;
                continue;
            }

            $textToReplace = trim((string) Arr::get($item, 'text_to_replace', ''));
            $path          = (string) Arr::get($item, 'path', '');

            if ($textToReplace === '' || ! $this->isValidStickerPath($path)) {
                $skipped++;
                continue;
            }

            $candidates[$i] = [
                'text_to_replace' => mb_substr($textToReplace, 0, 100),
                'path'            => $path,
                'item'            => $item,
            ];
        }

        // Batch-fetch already-existing text_to_replace values in a single query
        // per chunk of 500. We rely on the DB-level UNIQUE index added by
        // 2026_05_13_000000_add_unique_text_to_replace as the authoritative guard
        // against TOCTOU races (CLAUDE.md §R-3); this batch pre-check just
        // short-circuits before issuing INSERTs that would fail anyway.
        $existing = [];
        $values = array_values(array_unique(array_column($candidates, 'text_to_replace')));
        foreach (array_chunk($values, 500) as $chunk) {
            $found = Sticker::whereIn('text_to_replace', $chunk)
                ->pluck('text_to_replace')
                ->all();
            foreach ($found as $v) {
                $existing[$v] = true;
            }
        }

        // Track text_to_replace values introduced in this batch so duplicates
        // INSIDE the same import are also detected without re-querying.
        $seenInBatch = [];

        foreach ($candidates as $row) {
            $textToReplace = $row['text_to_replace'];

            if (isset($existing[$textToReplace]) || isset($seenInBatch[$textToReplace])) {
                $skipped++;
                continue;
            }

            $item = $row['item'];
            $sticker = Sticker::build(
                mb_substr((string) Arr::get($item, 'category', ''), 0, 100),
                mb_substr((string) Arr::get($item, 'category_name', ''), 0, 100),
                mb_substr((string) Arr::get($item, 'title', ''), 0, 100),
                $textToReplace,
                $row['path']
            );

            try {
                $sticker->save();
                $seenInBatch[$textToReplace] = true;
                $imported++;
            } catch (\Illuminate\Database\QueryException $e) {
                // Unique constraint violation — defensive fallback if a concurrent
                // request inserted the same text_to_replace between our pre-check
                // and the save. Counted as skipped, not an import failure.
                $skipped++;
            }
        }

        return new JsonResponse([
            'status'   => 'ok',
            'imported' => $imported,
            'skipped'  => $skipped,
            'total'    => $imported + $skipped,
        ], 200);
    }

    private function isValidStickerPath(string $path): bool
    {
        // Local asset under our public folder
        if (preg_match('#^/assets/stickers/[A-Za-z0-9._-]+$#', $path)) {
            return true;
        }
        // External https(s) URL
        if (preg_match('#^https?://#i', $path)) {
            return filter_var($path, FILTER_VALIDATE_URL) !== false;
        }
        return false;
    }

    private function mimeMatches(string $content, string $extension): bool
    {
        $allowed = UploadStickerController::ALLOWED[$extension] ?? null;
        if ($allowed === null) {
            return false;
        }

        $detected = null;
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detected = finfo_buffer($finfo, $content) ?: null;
                finfo_close($finfo);
            }
        }
        if ($detected === null) {
            return false; // can't validate -> reject (fail closed)
        }
        return in_array(strtolower($detected), $allowed, true);
    }
}
