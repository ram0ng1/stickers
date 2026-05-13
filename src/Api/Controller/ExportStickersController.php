<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
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

        $stickers = Sticker::all();
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

        $zip->addFromString('stickers.json', json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();

        $binary = file_get_contents($tmpFile);
        @unlink($tmpFile);

        // Return the ZIP as base64 inside JSON so app.request() can handle it transparently
        return new JsonResponse([
            'filename' => 'stickers-' . date('Y-m-d') . '.zip',
            'data'     => base64_encode($binary),
        ], 200);
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
