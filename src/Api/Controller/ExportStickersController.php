<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
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
        $stickers = Sticker::all();
        $publicPath = $this->paths->public;
        $tmpFile    = tempnam(sys_get_temp_dir(), 'stickers_export_') . '.zip';

        $zip = new \ZipArchive();
        if ($zip->open($tmpFile, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return new JsonResponse(['error' => 'Could not create ZIP'], 500);
        }

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

            // Include actual file for local paths
            if ($path !== '' && ! preg_match('/^https?:\/\//i', $path)) {
                $filePath = $publicPath . $path;

                if (file_exists($filePath)) {
                    $zipEntry     = 'files/' . basename($path);
                    $zip->addFile($filePath, $zipEntry);
                    $item['file'] = $zipEntry;
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
}
