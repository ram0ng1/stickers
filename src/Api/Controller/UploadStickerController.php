<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class UploadStickerController implements RequestHandlerInterface
{
    public function __construct(
        protected Paths $paths
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();

        if (empty($uploadedFiles['file'])) {
            return new JsonResponse(['error' => 'No file uploaded'], 400);
        }

        $file = $uploadedFiles['file'];

        if ($file->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['error' => 'Upload error: ' . $file->getError()], 400);
        }

        $originalName = $file->getClientFilename();
        $extension    = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        // Allow images, Lottie JSON and Telegram animated stickers (TGS)
        $allowed = ['json', 'tgs', 'png', 'gif', 'webp', 'jpg', 'jpeg', 'apng'];
        if (!in_array($extension, $allowed)) {
            return new JsonResponse(['error' => 'Unsupported file type: ' . $extension], 400);
        }

        // Ensure directory exists
        $dir = $this->paths->public . '/assets/stickers/';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Unique filename
        $filename = uniqid('sticker_', true) . '.' . $extension;
        $dest     = $dir . $filename;

        $file->moveTo($dest);

        return new JsonResponse([
            'path' => '/assets/stickers/' . $filename,
        ], 200);
    }
}
