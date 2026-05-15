<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

class ExportStickersController implements RequestHandlerInterface
{
    public function __construct(
        protected Paths $paths
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $publicPath = $this->paths->public;
        $tmpFile    = tempnam(sys_get_temp_dir(), 'stickers_export_') . '.zip';

        $zip = new \ZipArchive();
        if ($zip->open($tmpFile, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return new JsonResponse(['error' => 'Could not create ZIP'], 500);
        }

        // Resolve the canonical storage base ONCE, outside the loop.
        // Path traversal hardening — see CLAUDE.md §13.
        $base = realpath($publicPath . '/assets/stickers');

        $metadata = [];

        // Stream stickers in chunks so we don't load every row into memory at once.
        Sticker::query()->orderBy('id')->chunk(500, function ($stickers) use (&$metadata, $zip, $publicPath, $base) {
            foreach ($stickers as $sticker) {
                $path = $sticker->path ?? '';
                $item = [
                    'category'        => $sticker->category,
                    'category_name'   => $sticker->category_name,
                    'title'           => $sticker->title,
                    'text_to_replace' => $sticker->text_to_replace,
                    'path'            => $path,
                ];

                // Include actual file for local paths — strictly confined to /assets/stickers/
                if ($path !== '' && ! preg_match('/^https?:\/\//i', $path)) {
                    if ($base !== false && $this->isOwnedLocalAsset($path, $publicPath, $base)) {
                        $filePath = realpath($publicPath . $path);
                        if ($filePath !== false && file_exists($filePath)) {
                            $zipEntry     = 'files/' . basename($path);
                            $zip->addFile($filePath, $zipEntry);
                            $item['file'] = $zipEntry;
                        }
                    }
                }

                $metadata[] = $item;
            }
        });

        $zip->addFromString('stickers.json', json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();

        // Stream the ZIP back as an attachment — never load it into PHP memory or
        // base64-encode it. The temp file is unlinked immediately so it's gone
        // even if the client aborts mid-download (the open handle keeps the bytes
        // alive on the filesystem until the response finishes).
        $size = @filesize($tmpFile) ?: null;
        $handle = @fopen($tmpFile, 'rb');
        if ($handle === false) {
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'Could not open generated ZIP'], 500);
        }
        @unlink($tmpFile);

        $filename = 'stickers-' . date('Y-m-d') . '.zip';

        $response = (new Response())
            ->withBody(new Stream($handle))
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $filename . '"')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Cache-Control', 'private, no-store, max-age=0');

        if ($size !== null) {
            $response = $response->withHeader('Content-Length', (string) $size);
        }

        return $response;
    }

    /**
     * Confirm that a stored path actually resolves inside the public stickers dir.
     * Defeats admin-controlled `../` path values that would let export read arbitrary
     * server files (CLAUDE.md §13 — path traversal hardening).
     */
    private function isOwnedLocalAsset(string $path, string $publicPath, string $base): bool
    {
        // Reject null bytes and stream wrappers up front.
        if (str_contains($path, "\0") || str_contains($path, '://')) {
            return false;
        }
        // Shape allowlist matches what ImportStickersController::isValidStickerPath accepts.
        if (! preg_match('#^/assets/stickers/[A-Za-z0-9._-]+$#', $path)) {
            return false;
        }
        // Canonicalize and confine with the trailing-separator prefix trick to avoid
        // matching e.g. /assets/stickers-backup/secret.
        $resolved = realpath($publicPath . $path);
        if ($resolved === false) {
            return false;
        }
        return str_starts_with($resolved . DIRECTORY_SEPARATOR, $base . DIRECTORY_SEPARATOR);
    }
}
