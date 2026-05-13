<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class UploadStickerController implements RequestHandlerInterface
{
    public const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

    /** @var array<string, string[]> Whitelisted extensions → allowed MIME types. */
    public const ALLOWED = [
        'json' => ['application/json', 'text/plain'],
        'tgs'  => ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
        'png'  => ['image/png'],
        'apng' => ['image/png', 'image/apng'],
        'gif'  => ['image/gif'],
        'webp' => ['image/webp'],
        'jpg'  => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
    ];

    public function __construct(
        protected Paths $paths
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $uploadedFiles = $request->getUploadedFiles();

        if (empty($uploadedFiles['file'])) {
            return new JsonResponse(['error' => 'No file uploaded'], 400);
        }

        $file = $uploadedFiles['file'];

        if ($file->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['error' => 'Upload error: ' . $file->getError()], 400);
        }

        // Size: reject null (chunked without Content-Length) and oversized.
        $size = $file->getSize();
        if ($size === null || $size <= 0 || $size > self::MAX_BYTES) {
            return new JsonResponse(['error' => 'File size invalid or exceeds limit'], 400);
        }

        $originalName = (string) $file->getClientFilename();
        $extension    = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if (! isset(self::ALLOWED[$extension])) {
            return new JsonResponse(['error' => 'Unsupported file type: ' . $extension], 400);
        }

        // MIME server-side via finfo (defense in depth — extension is forgeable).
        $tmpPath = $file->getStream()->getMetadata('uri');
        $detectedMime = null;
        if (is_string($tmpPath) && is_readable($tmpPath)) {
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                if ($finfo) {
                    $detectedMime = finfo_file($finfo, $tmpPath) ?: null;
                    finfo_close($finfo);
                }
            } elseif (function_exists('mime_content_type')) {
                $detectedMime = mime_content_type($tmpPath) ?: null;
            }
        }
        if ($detectedMime === null || ! in_array(strtolower($detectedMime), self::ALLOWED[$extension], true)) {
            return new JsonResponse(['error' => 'MIME mismatch for ' . $extension], 400);
        }

        $dir = $this->paths->public . '/assets/stickers/';
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Filename generated server-side; client-supplied name is ignored.
        $filename = bin2hex(random_bytes(16)) . '.' . $extension;
        $dest     = $dir . $filename;

        $file->moveTo($dest);
        @chmod($dest, 0644);

        return new JsonResponse([
            'path' => '/assets/stickers/' . $filename,
        ], 200);
    }
}
